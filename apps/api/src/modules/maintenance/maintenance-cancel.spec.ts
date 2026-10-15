/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAINTENANCE_TRANSITIONS } from '@rental/shared';
import { isSerializationFailure } from '../../database/serialization-failure';
import { WorkspaceArchivedRepositoryError } from '../workspaces/repositories/workspace.repository';
import {
  MaintenanceInvalidTransitionRepositoryError,
  MaintenanceNotCancellableRepositoryError,
  MaintenanceNotEditableRepositoryError,
  MaintenanceNotFoundRepositoryError,
  MaintenanceRepository,
} from './maintenance.repository';
import { MaintenanceService, toResponse } from './maintenance.service';

const row = (o: Record<string, unknown> = {}) => ({
  id: 'm1',
  workspaceId: 'w',
  buildingId: 'b',
  roomId: 'r',
  contractId: 'c',
  tenantId: 't',
  requestedBy: 'tu',
  title: 'Leak',
  description: 'd',
  priority: 'MEDIUM',
  status: 'OPEN',
  assigneeUserId: null,
  resolutionNote: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...o,
});

function repoWith(current: unknown, wsStatus = 'ACTIVE', locked = true) {
  const tx: any = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce(locked ? [{ workspace_id: 'w' }] : []) // FOR UPDATE
      .mockResolvedValueOnce([{ status: wsStatus }]) // workspace
      .mockResolvedValueOnce([{ status: 'ACTIVE' }]) // building
      .mockResolvedValueOnce([{ status: 'OCCUPIED' }]), // room
    maintenanceRequest: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row({ status: 'CANCELLED' })),
    },
    maintenanceStatusHistory: { create: jest.fn() },
  };
  const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
  return { tx, repository: new MaintenanceRepository(prisma as never) };
}

describe('tenant cancel', () => {
  it('cancels an OPEN unassigned request and writes OPEN -> CANCELLED history with the reason', async () => {
    const { tx, repository } = repoWith(row());
    await repository.cancelForTenant('tu', 'm1', ' changed my mind ');
    expect(tx.maintenanceRequest.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { status: 'CANCELLED' },
    });
    expect(tx.maintenanceStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: 'OPEN',
        toStatus: 'CANCELLED',
        note: 'changed my mind',
        changedBy: 'tu',
        assigneeUserId: null,
      }),
    });
  });

  it('takes a row lock before reading state (blocks concurrent assign/start)', async () => {
    const { tx, repository } = repoWith(row());
    await repository.cancelForTenant('tu', 'm1');
    expect(
      String((tx.$queryRaw.mock.calls[0][0] as { strings: string[] }).strings.join(' ')),
    ).toContain('FOR UPDATE');
  });

  it.each([
    ['assigned', row({ assigneeUserId: 'staff' })],
    ['IN_PROGRESS', row({ status: 'IN_PROGRESS', assigneeUserId: 'staff' })],
    ['RESOLVED', row({ status: 'RESOLVED', assigneeUserId: 'staff' })],
    ['CLOSED', row({ status: 'CLOSED' })],
    ['already CANCELLED', row({ status: 'CANCELLED' })],
  ])('refuses a request that is %s', async (_n, current) => {
    const { tx, repository } = repoWith(current);
    await expect(repository.cancelForTenant('tu', 'm1')).rejects.toBeInstanceOf(
      MaintenanceNotCancellableRepositoryError,
    );
    expect(tx.maintenanceRequest.update).not.toHaveBeenCalled();
    expect(tx.maintenanceStatusHistory.create).not.toHaveBeenCalled();
  });

  it("hides other tenants' and unknown requests as not found", async () => {
    await expect(repoWith(null).repository.cancelForTenant('x', 'm1')).rejects.toBeInstanceOf(
      MaintenanceNotFoundRepositoryError,
    );
    await expect(
      repoWith(row(), 'ACTIVE', false).repository.cancelForTenant('x', 'm1'),
    ).rejects.toBeInstanceOf(MaintenanceNotFoundRepositoryError);
  });

  it('is blocked when the workspace is archived', async () => {
    await expect(
      repoWith(row(), 'ARCHIVED').repository.cancelForTenant('tu', 'm1'),
    ).rejects.toBeInstanceOf(WorkspaceArchivedRepositoryError);
  });

  it('maps to MAINTENANCE_NOT_CANCELLABLE and hides assignee/staff data from the tenant', async () => {
    const service = new MaintenanceService({
      cancelForTenant: jest.fn().mockRejectedValue(new MaintenanceNotCancellableRepositoryError()),
    } as never);
    await expect(service.cancelForTenant('u', 'm')).rejects.toMatchObject({
      code: 'MAINTENANCE_NOT_CANCELLABLE',
    });
    const r = toResponse({ ...row({ status: 'CANCELLED' }), history: [] } as never, true);
    expect(r.assigneeUserId).toBeNull();
    expect(r.requestedBy).toBeNull();
  });
});

describe('managers cannot touch CANCELLED requests', () => {
  it('CANCELLED is terminal and not reachable by a manager transition', () => {
    expect(MAINTENANCE_TRANSITIONS.CANCELLED).toEqual([]);
    for (const targets of Object.values(MAINTENANCE_TRANSITIONS))
      expect(targets).not.toContain('CANCELLED');
  });

  it('transition/update on CANCELLED are refused as not editable', async () => {
    const tx: any = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'm1' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      maintenanceRequest: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(row({ status: 'CANCELLED' })),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
    const repository = new MaintenanceRepository(prisma as never);
    await expect(
      repository.transition('w', 'owner', 'b', 'm1', {
        toStatus: 'IN_PROGRESS',
        assigneeUserId: 'a',
      } as never),
    ).rejects.toBeInstanceOf(MaintenanceNotEditableRepositoryError);
    expect(tx.maintenanceRequest.update).not.toHaveBeenCalled();
    void MaintenanceInvalidTransitionRepositoryError;
  });
});

describe('cancellation migrations', () => {
  const dir = resolve(__dirname, '../../../prisma/migrations');
  const strip = (s: string) => s.replace(/^--.*$/gm, '').trim();
  const enumSql = strip(
    readFileSync(`${dir}/202610150022_p09_maintenance_cancelled_enum/migration.sql`, 'utf8'),
  );
  const rulesSql = strip(
    readFileSync(`${dir}/202610150023_p09_maintenance_cancelled_rules/migration.sql`, 'utf8'),
  );

  it('step 1 only adds the enum value (own transaction)', () => {
    expect(enumSql).toBe(`ALTER TYPE "maintenance_status" ADD VALUE IF NOT EXISTS 'CANCELLED';`);
  });
  it('step 2 touches no rows and no tables other than maintenance_requests', () => {
    expect(rulesSql).not.toMatch(
      /\b(INSERT|UPDATE\s+"|DELETE|TRUNCATE|DROP\s+(TABLE|COLUMN|TYPE))\b/i,
    );
    expect(rulesSql.match(/ALTER TABLE "([a-z_]+)"/g)).toEqual([
      'ALTER TABLE "maintenance_requests"',
      'ALTER TABLE "maintenance_requests"',
    ]);
  });
  it('step 2 keeps every old CHECK branch and only adds CANCELLED', () => {
    const original = readFileSync(`${dir}/202610140019_p09_maintenance/migration.sql`, 'utf8');
    for (const branch of ["'OPEN' AND", "'IN_PROGRESS' AND", "'RESOLVED' AND", "'CLOSED' AND"])
      expect(original).toContain(branch);
    for (const branch of [
      "'OPEN' AND",
      "'IN_PROGRESS' AND",
      "'RESOLVED' AND",
      "'CLOSED' AND",
      "'CANCELLED' AND",
    ])
      expect(rulesSql).toContain(branch);
  });
  it('step 2 trigger allows only OPEN -> CANCELLED, unassigned, and freezes CANCELLED', () => {
    expect(rulesSql).toContain(`OLD."status" IN ('CLOSED', 'CANCELLED')`);
    expect(rulesSql).toContain(`(OLD."status" = 'OPEN' AND NEW."status" = 'CANCELLED')`);
    expect(rulesSql).toContain('an assigned maintenance request cannot be cancelled');
  });
});

describe('serialization conflicts', () => {
  it('retries P2034 so the loser gets a business result, not a 500', async () => {
    const { repository, tx } = repoWith(row());
    const prisma = (repository as any).prisma;
    let calls = 0;
    prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) => {
      calls += 1;
      if (calls === 1)
        return Promise.reject(Object.assign(new Error('conflict'), { code: 'P2034' }));
      return fn(tx);
    });
    await expect(repository.cancelForTenant('tu', 'm1')).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
  it('gives up after the retry budget and rethrows', async () => {
    const { repository } = repoWith(row());
    (repository as any).prisma.$transaction = jest.fn(() =>
      Promise.reject(Object.assign(new Error('conflict'), { code: 'P2034' })),
    );
    await expect(repository.cancelForTenant('tu', 'm1')).rejects.toMatchObject({ code: 'P2034' });
    expect((repository as any).prisma.$transaction).toHaveBeenCalledTimes(5);
  });
});

describe('isSerializationFailure', () => {
  it('recognises model (P2034) and raw (P2010/40001) failures only', () => {
    expect(isSerializationFailure({ code: 'P2034' })).toBe(true);
    expect(isSerializationFailure({ code: 'P2010', meta: { code: '40001' } })).toBe(true);
    expect(isSerializationFailure({ code: 'P2010', meta: { code: '40P01' } })).toBe(true);
    expect(
      isSerializationFailure(new Error('could not serialize access due to concurrent update')),
    ).toBe(true);
    expect(isSerializationFailure({ code: 'P2010', meta: { code: '23505' } })).toBe(false);
    expect(isSerializationFailure(new Error('boom'))).toBe(false);
  });
});
