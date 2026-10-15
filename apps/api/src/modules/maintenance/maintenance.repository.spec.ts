import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorkspaceNotFoundRepositoryError } from '../workspaces/repositories/workspace.repository';
import { ContractNotFoundRepositoryError } from '../contracts/repositories/contract.repository';
import {
  MaintenanceInvalidTransitionRepositoryError,
  MaintenanceNotEditableRepositoryError,
  MaintenanceNoteRequiredRepositoryError,
  MaintenanceNotEligibleRepositoryError,
  MaintenanceRepository,
} from './maintenance.repository';
import { toResponse } from './maintenance.service';

const base = {
  id: 'm1',
  workspaceId: 'w',
  buildingId: 'b',
  roomId: 'r',
  contractId: 'c',
  tenantId: 't',
  requestedBy: 'tu',
  title: 'Leak',
  description: 'Sink leaks',
  priority: 'MEDIUM',
  status: 'OPEN',
  assigneeUserId: null,
  resolutionNote: null,
  resolvedAt: null,
  closedAt: null,
  createdAt: new Date('2026-10-14'),
  updatedAt: new Date('2026-10-14'),
};
const mgr = (o: { role?: string; ws?: string; building?: string } = {}) => ({
  $queryRaw: jest
    .fn()
    .mockResolvedValueOnce([{ status: o.ws ?? 'ACTIVE' }])
    .mockResolvedValueOnce([{ status: o.building ?? 'ACTIVE' }]),
  workspaceMembership: {
    findUnique: jest.fn().mockResolvedValue({ role: o.role ?? 'OWNER', userId: 'x' }),
  },
});
const repoOf = (tx: object) =>
  new MaintenanceRepository({ $transaction: (fn: (t: object) => unknown) => fn(tx) } as never);

describe('MaintenanceRepository.createForTenant', () => {
  const input = {
    contractId: 'c',
    title: ' Leak ',
    description: ' Sink leaks ',
    priority: 'HIGH' as const,
  };
  const make = (
    o: { contract?: object | null; ws?: string; building?: string; room?: string } = {},
  ) => ({
    contract: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          o.contract === undefined
            ? { id: 'c', workspaceId: 'w', roomId: 'r', tenantId: 't', room: { buildingId: 'b' } }
            : o.contract,
        ),
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([{ status: o.ws ?? 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: o.building ?? 'ACTIVE' }])
      .mockResolvedValueOnce([{ status: o.room ?? 'OCCUPIED' }]),
    maintenanceRequest: {
      create: jest.fn().mockResolvedValue({ ...base, priority: 'HIGH' }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...base, history: [] }),
    },
    maintenanceStatusHistory: { create: jest.fn() },
  });

  it("only looks up the caller's own ACTIVE contract with a live account link", async () => {
    const tx = make();
    await repoOf(tx).createForTenant('tu', input);
    expect(tx.contract.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'c',
      status: 'ACTIVE',
      tenant: { userLinks: { some: { userId: 'tu', revokedAt: null } } },
    });
  });
  it('creates an OPEN request for the contract room with an initial history row', async () => {
    const tx = make();
    await repoOf(tx).createForTenant('tu', input);
    expect(tx.maintenanceRequest.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: 'w',
      buildingId: 'b',
      roomId: 'r',
      contractId: 'c',
      tenantId: 't',
      requestedBy: 'tu',
      title: 'Leak',
      description: 'Sink leaks',
    });
    expect(tx.maintenanceStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      fromStatus: null,
      toStatus: 'OPEN',
      changedBy: 'tu',
    });
  });
  it('refuses a request on a contract that has not started yet (the tenant can still read it)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-14T20:00:00.000Z')); // 2026-10-15 03:00 in Vietnam
    try {
      const future = {
        id: 'c',
        workspaceId: 'w',
        roomId: 'r',
        tenantId: 't',
        startDate: new Date('2026-10-16'),
        room: { buildingId: 'b' },
      };
      const tx = make({ contract: future });
      await expect(repoOf(tx).createForTenant('tu', input)).rejects.toBeInstanceOf(
        MaintenanceNotEligibleRepositoryError,
      );
      expect(tx.maintenanceRequest.create).not.toHaveBeenCalled();
      // starting today (Vietnam date) is allowed, even though UTC is still the 14th
      const today = { ...future, startDate: new Date('2026-10-15') };
      await expect(
        repoOf(make({ contract: today })).createForTenant('tu', input),
      ).resolves.toBeDefined();
    } finally {
      jest.useRealTimers();
    }
  });
  it("rejects other people's or non-active contracts, archived workspace/building/room", async () => {
    await expect(
      repoOf(make({ contract: null })).createForTenant('tu', input),
    ).rejects.toBeInstanceOf(ContractNotFoundRepositoryError);
    await expect(repoOf(make({ ws: 'ARCHIVED' })).createForTenant('tu', input)).rejects.toThrow();
    await expect(
      repoOf(make({ building: 'ARCHIVED' })).createForTenant('tu', input),
    ).rejects.toBeInstanceOf(MaintenanceNotEligibleRepositoryError);
    await expect(
      repoOf(make({ room: 'ARCHIVED' })).createForTenant('tu', input),
    ).rejects.toBeInstanceOf(MaintenanceNotEligibleRepositoryError);
  });
});

describe('MaintenanceRepository manager actions', () => {
  const make = (
    status: string,
    extra: Record<string, unknown> = {},
    o: Parameters<typeof mgr>[0] = {},
  ) => {
    const s = mgr(o);
    s.$queryRaw.mockResolvedValueOnce([{ id: 'm1' }]);
    return {
      ...s,
      maintenanceRequest: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...base,
          status,
          assigneeUserId: status === 'OPEN' ? null : 'u2',
          ...extra,
          history: [],
        }),
        update: jest.fn().mockResolvedValue(base),
      },
      maintenanceStatusHistory: { create: jest.fn() },
    };
  };
  const go = (tx: object, toStatus: string, extra: object = {}) =>
    repoOf(tx).transition('w', 'u', 'b', 'm1', { toStatus, ...extra } as never);

  it('walks OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED with history for each step', async () => {
    const a = make('OPEN');
    await go(a, 'IN_PROGRESS');
    expect(a.maintenanceRequest.update.mock.calls[0][0].data).toMatchObject({
      status: 'IN_PROGRESS',
      assigneeUserId: null,
    });
    expect(a.maintenanceStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      fromStatus: 'OPEN',
      toStatus: 'IN_PROGRESS',
      changedBy: 'u',
    });
    const b = make('IN_PROGRESS');
    await go(b, 'RESOLVED', { note: ' Replaced the pipe ' });
    const d = b.maintenanceRequest.update.mock.calls[0][0].data;
    expect(d).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Replaced the pipe' });
    expect(d.resolvedAt).toBeInstanceOf(Date);
    const c = make('RESOLVED');
    await go(c, 'CLOSED');
    expect(c.maintenanceRequest.update.mock.calls[0][0].data.closedAt).toBeInstanceOf(Date);
  });
  it('is forward-only: no skipping, no reopening', async () => {
    for (const [from, to] of [
      ['OPEN', 'RESOLVED'],
      ['OPEN', 'CLOSED'],
      ['IN_PROGRESS', 'CLOSED'],
      ['RESOLVED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'OPEN'],
      ['OPEN', 'OPEN'],
    ] as Array<[string, string]>)
      await expect(go(make(from), to)).rejects.toBeInstanceOf(
        MaintenanceInvalidTransitionRepositoryError,
      );
  });
  it('freezes CLOSED requests', async () => {
    await expect(go(make('CLOSED'), 'CLOSED')).rejects.toBeInstanceOf(
      MaintenanceNotEditableRepositoryError,
    );
    await expect(
      repoOf(make('CLOSED')).update('w', 'u', 'b', 'm1', { title: 'x' }),
    ).rejects.toBeInstanceOf(MaintenanceNotEditableRepositoryError);
  });
  it('needs a note to resolve but no assignee to start work (V1: OWNER handles requests directly)', async () => {
    await expect(go(make('OPEN'), 'IN_PROGRESS')).resolves.toBeDefined();
    await expect(go(make('IN_PROGRESS'), 'RESOLVED')).rejects.toBeInstanceOf(
      MaintenanceNoteRequiredRepositoryError,
    );
    await expect(go(make('IN_PROGRESS'), 'RESOLVED', { note: '  ' })).rejects.toBeInstanceOf(
      MaintenanceNoteRequiredRepositoryError,
    );
  });
  it('never creates or changes an assignment, and keeps a legacy assignee untouched', async () => {
    const fresh = make('OPEN');
    await go(fresh, 'IN_PROGRESS', { assigneeUserId: 'someone' });
    expect(fresh.maintenanceRequest.update.mock.calls[0][0].data.assigneeUserId).toBeNull();
    expect(fresh.maintenanceStatusHistory.create.mock.calls[0][0].data.assigneeUserId).toBeNull();
    expect(fresh.workspaceMembership.findUnique).toHaveBeenCalledTimes(1); // OWNER check only
    const legacy = make('IN_PROGRESS'); // helper seeds legacy assignee 'u2'
    await go(legacy, 'RESOLVED', { note: 'done', assigneeUserId: 'someone' });
    expect(legacy.maintenanceRequest.update.mock.calls[0][0].data.assigneeUserId).toBe('u2');
    expect(legacy.maintenanceStatusHistory.create.mock.calls[0][0].data.assigneeUserId).toBe('u2');
    const edit = make('IN_PROGRESS');
    await repoOf(edit).update('w', 'u', 'b', 'm1', { title: 'T', assigneeUserId: null } as never);
    expect(edit.maintenanceRequest.update.mock.calls[0][0].data.assigneeUserId).toBe('u2');
  });
  it('blocks STAFF/MANAGER, archived workspaces and archived buildings', async () => {
    await expect(go(make('OPEN', {}, { role: 'STAFF' }), 'IN_PROGRESS')).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    await expect(go(make('OPEN', {}, { role: 'MANAGER' }), 'IN_PROGRESS')).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    await expect(go(make('OPEN', {}, { ws: 'ARCHIVED' }), 'IN_PROGRESS')).rejects.toThrow();
    await expect(
      go(make('OPEN', {}, { building: 'ARCHIVED' }), 'IN_PROGRESS'),
    ).rejects.toBeInstanceOf(MaintenanceNotEligibleRepositoryError);
  });
  it('logs priority changes in history and nothing for plain edits', async () => {
    const a = make('OPEN');
    await repoOf(a).update('w', 'u', 'b', 'm1', { priority: 'URGENT' });
    expect(a.maintenanceStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      fromStatus: 'OPEN',
      toStatus: 'OPEN',
      priority: 'URGENT',
    });
    const c = make('OPEN');
    await repoOf(c).update('w', 'u', 'b', 'm1', { title: 'New title' });
    expect(c.maintenanceStatusHistory.create).not.toHaveBeenCalled();
  });
});

describe('tenant response', () => {
  it('hides the assignee and staff identities from tenants', () => {
    const row = {
      ...base,
      assigneeUserId: 'u2',
      history: [
        {
          id: 'h',
          workspaceId: 'w',
          requestId: 'm1',
          fromStatus: null,
          toStatus: 'OPEN',
          priority: 'MEDIUM',
          assigneeUserId: 'u2',
          note: 'n',
          changedBy: 'u9',
          createdAt: new Date(),
        },
      ],
    } as never;
    const t = toResponse(row, true);
    expect(t.assigneeUserId).toBeNull();
    expect(t.requestedBy).toBeNull();
    expect(t.history?.[0]).toMatchObject({ assigneeUserId: null, changedBy: null, note: 'n' });
    expect(toResponse(row, false).assigneeUserId).toBe('u2');
  });
});

describe('P09 maintenance migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../prisma/migrations/202610140019_p09_maintenance/migration.sql'),
    'utf8',
  );
  it('is purely additive', () => {
    expect(sql).not.toMatch(
      /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|ALTER TABLE "(?!maintenance_)/i,
    );
  });
  it('scopes exactly, enforces the state machine and keeps history', () => {
    expect(sql).toContain('FOREIGN KEY ("room_id", "building_id", "workspace_id")');
    expect(sql).toContain('FOREIGN KEY ("contract_id", "room_id", "tenant_id", "workspace_id")');
    expect(sql).toContain('invalid maintenance status transition');
    expect(sql).toContain('closed maintenance requests are immutable');
    expect(sql).toContain('maintenance requests and their history cannot be hard-deleted');
    expect(sql).toContain('maintenance history is append-only');
  });
});
