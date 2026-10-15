import { Prisma } from '../../../generated/prisma/client';
import { TenantArchivedRepositoryError, TenantRepository } from './tenant.repository';

describe('TenantRepository', () => {
  const input = {
    fullName: 'Nguyễn Văn A',
    phone: '+84901234567',
    email: 'tenant@example.com',
    dateOfBirth: '1995-05-20',
  };

  it('creates a tenant only after database-backed workspace and role checks', async () => {
    const created = { id: 'tenant-1' };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      tenant: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(tx)) };
    const repository = new TenantRepository(prisma as never);
    await expect(repository.create('workspace-1', 'user-1', input)).resolves.toBe(created);
    expect(tx.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspace: { connect: { id: 'workspace-1' } },
        fullName: 'Nguyễn Văn A',
        dateOfBirth: new Date('1995-05-20T00:00:00.000Z'),
      }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('scopes list and detail reads to the workspace', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new TenantRepository({
      tenant: { findMany, count, findFirst },
      $transaction: jest.fn(async (operations) => Promise.all(operations)),
    } as never);
    await repository.list('workspace-1', { status: 'ACTIVE', page: 2, limit: 10 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'workspace-1', status: 'ACTIVE' },
        skip: 10,
        take: 10,
      }),
    );
    await repository.detail('workspace-1', 'tenant-1');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'tenant-1', workspaceId: 'workspace-1' },
    });
  });

  it('updates only a tenant locked within the same workspace', async () => {
    const updated = { id: 'tenant-1', fullName: 'Nguyễn Văn B' };
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ACTIVE' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      tenant: { update: jest.fn().mockResolvedValue(updated) },
    };
    const repository = new TenantRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.update('workspace-1', 'user-1', 'tenant-1', { fullName: 'Nguyễn Văn B' }),
    ).resolves.toBe(updated);
    expect(tx.tenant.update).toHaveBeenCalledWith({
      where: { id: 'tenant-1' },
      data: expect.objectContaining({ fullName: 'Nguyễn Văn B' }),
    });
  });

  it('blocks changes to an archived tenant profile', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      tenant: { update: jest.fn() },
    };
    const repository = new TenantRepository({
      $transaction: jest.fn(async (operation) => operation(tx)),
    } as never);
    await expect(
      repository.update('workspace-1', 'user-1', 'tenant-1', { fullName: 'Changed' }),
    ).rejects.toBeInstanceOf(TenantArchivedRepositoryError);
    expect(tx.tenant.update).not.toHaveBeenCalled();
  });
});
