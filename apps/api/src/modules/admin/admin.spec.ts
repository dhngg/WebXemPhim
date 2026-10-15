/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATH_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { PlatformAdminGuard } from './admin.guard';
import {
  AdminNotAuthorizedRepositoryError,
  AdminRepository,
  AdminStateUnchangedRepositoryError,
  AdminTargetProtectedRepositoryError,
} from './admin.repository';
import { AdminService, toListingResponse } from './admin.service';

jest.mock('../auth/http/auth-http-security', () => ({
  AccessAuthGuard: class {},
  AuthOriginGuard: class {},
  getAuthenticatedUser: () => ({ id: 'admin-1' }),
}));

const ctx = { switchToHttp: () => ({ getRequest: () => ({}) }) } as never;

describe('PlatformAdminGuard', () => {
  const guard = (row: unknown) =>
    new PlatformAdminGuard({
      platformAdmin: { findUnique: jest.fn().mockResolvedValue(row) },
    } as never);

  it('allows an active platform admin', async () => {
    await expect(
      guard({ userId: 'admin-1', user: { status: 'ACTIVE' } }).canActivate(ctx),
    ).resolves.toBe(true);
  });
  it('rejects ordinary users and workspace owners (no platform_admins row)', async () => {
    await expect(guard(null).canActivate(ctx)).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
  });
  it('rejects a disabled admin', async () => {
    await expect(
      guard({ userId: 'a', user: { status: 'DISABLED' } }).canActivate(ctx),
    ).rejects.toMatchObject({
      code: 'PLATFORM_ADMIN_REQUIRED',
    });
  });
});

function repoWith(tx: Record<string, unknown>) {
  const prisma = { $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)) };
  return new AdminRepository(prisma as never);
}
const adminTx = (extra: Record<string, unknown> = {}): any => ({
  platformAdmin: {
    findUnique: jest
      .fn()
      .mockImplementation(({ where }: { where: { userId: string } }) =>
        Promise.resolve(
          where.userId === 'admin-1'
            ? { user: { status: 'ACTIVE' } }
            : where.userId === 'admin-2'
              ? { userId: 'admin-2' }
              : null,
        ),
      ),
  },
  $queryRaw: jest.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
  user: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'u' }) },
  authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  adminAuditLog: { create: jest.fn() },
  ...extra,
});

describe('AdminRepository account lock', () => {
  it('refuses to lock yourself', async () => {
    await expect(
      repoWith(adminTx()).setUserLock('admin-1', 'admin-1', true, 'r'),
    ).rejects.toBeInstanceOf(AdminTargetProtectedRepositoryError);
  });
  it('refuses to lock another platform admin', async () => {
    await expect(
      repoWith(adminTx()).setUserLock('admin-1', 'admin-2', true, 'r'),
    ).rejects.toBeInstanceOf(AdminTargetProtectedRepositoryError);
  });
  it('rechecks the actor in the transaction', async () => {
    await expect(repoWith(adminTx()).setUserLock('nobody', 'u1', true, 'r')).rejects.toBeInstanceOf(
      AdminNotAuthorizedRepositoryError,
    );
  });
  it('locks, revokes sessions and writes one audit row with the reason', async () => {
    const tx = adminTx();
    await repoWith(tx).setUserLock('admin-1', 'u1', true, 'spam');
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: expect.objectContaining({ status: 'DISABLED' }),
      }),
    );
    expect(tx.authSession.updateMany).toHaveBeenCalled();
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'USER_LOCK',
        reason: 'spam',
        targetId: 'u1',
        metadata: { previousStatus: 'ACTIVE', newStatus: 'DISABLED', revokedSessions: 2 },
      }),
    });
  });
  it('is a conflict when the state would not change', async () => {
    const tx = adminTx({ $queryRaw: jest.fn().mockResolvedValue([{ status: 'DISABLED' }]) });
    await expect(repoWith(tx).setUserLock('admin-1', 'u1', true, 'r')).rejects.toBeInstanceOf(
      AdminStateUnchangedRepositoryError,
    );
    expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
  });
});

describe('AdminRepository listing moderation', () => {
  const listingTx = (moderation: unknown): any =>
    adminTx({
      $queryRaw: jest.fn().mockResolvedValue([{ workspace_id: 'w', room_id: 'r' }]),
      listingModeration: { findUnique: jest.fn().mockResolvedValue(moderation), upsert: jest.fn() },
      listing: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'l' }), update: jest.fn() },
    });

  it('hides by writing only moderation state + audit; never touches the listing or room', async () => {
    const tx = listingTx(null);
    await repoWith(tx).setListingHidden('admin-1', 'l1', true, 'fake photos');
    expect(tx.listingModeration.upsert).toHaveBeenCalledTimes(1);
    expect(tx.listing.update).not.toHaveBeenCalled();
    expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LISTING_HIDE',
        metadata: { workspaceId: 'w', roomId: 'r' },
      }),
    });
  });
  it('restore of a visible listing is a conflict', async () => {
    await expect(
      repoWith(listingTx({ isHidden: false })).setListingHidden('admin-1', 'l1', false, 'r'),
    ).rejects.toBeInstanceOf(AdminStateUnchangedRepositoryError);
  });
});

describe('AdminService', () => {
  it('maps repository errors to application errors', async () => {
    const service = new AdminService({
      setUserLock: jest.fn().mockRejectedValue(new AdminTargetProtectedRepositoryError()),
    } as never);
    await expect(service.setUserLock('a', 'b', true, 'r')).rejects.toMatchObject({
      code: 'ADMIN_TARGET_PROTECTED',
    });
  });
  it('listing response exposes no tenant, contract or owner data', () => {
    const r = toListingResponse({
      id: 'l',
      workspaceId: 'w',
      roomId: 'r',
      isPublished: true,
      room: {
        code: 'A1',
        monthlyRent: { toFixed: () => '3000000.00' },
        building: { name: 'B', city: 'HN' },
      },
      moderation: null,
    });
    expect(Object.keys(r).sort()).toEqual(
      [
        'buildingName',
        'city',
        'id',
        'isHidden',
        'isPublished',
        'moderatedAt',
        'moderationReason',
        'monthlyRent',
        'roomCode',
        'roomId',
        'workspaceId',
      ].sort(),
    );
  });
  it('audit metadata only keeps scalar values', async () => {
    const service = new AdminService({
      listAudit: jest.fn().mockResolvedValue({
        total: 1,
        items: [
          {
            id: '1',
            actorUserId: 'a',
            action: 'USER_LOCK',
            targetType: 'USER',
            targetId: 't',
            reason: 'r',
            metadata: { ok: 1, nested: { password: 'x' }, list: [1] },
            createdAt: new Date(0),
          },
        ],
      }),
    } as never);
    const page = await service.listAudit({ page: 1, limit: 20 } as never);
    expect(page.items[0]!.metadata).toEqual({ ok: 1 });
  });
});

describe('admin surface', () => {
  it('only exposes users, listings, landlord applications and audit-logs routes', () => {
    const proto = AdminController.prototype as unknown as Record<string, unknown>;
    const routes = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor')
      .map((n) => Reflect.getMetadata(PATH_METADATA, proto[n] as object) as string);
    expect(routes.sort()).toEqual(
      [
        'audit-logs',
        'landlord-applications',
        'landlord-applications/:applicationId/approve',
        'landlord-applications/:applicationId/reject',
        'listings',
        'listings/:listingId/hide',
        'listings/:listingId/restore',
        'users',
        'users/:userId',
        'users/:userId/lock',
        'users/:userId/unlock',
      ].sort(),
    );
  });
  const sql = readFileSync(
    resolve(__dirname, '../../../prisma/migrations/202610150021_p12_platform_admin/migration.sql'),
    'utf8',
  );
  it('migration is additive: no DROP/ALTER/UPDATE/INSERT/DELETE of existing data', () => {
    const code = sql.replace(/^--.*$/gm, '');
    expect(code).not.toMatch(
      /\bDROP\b|\bALTER\s+TABLE\b|\bTRUNCATE\b|\bUPDATE\s+"|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b/i,
    );
  });
  it('migration keeps audit append-only and grants no admin', () => {
    expect(sql).toContain('admin audit logs are append-only');
    expect(sql).toContain('actor is not a platform admin');
  });
});
