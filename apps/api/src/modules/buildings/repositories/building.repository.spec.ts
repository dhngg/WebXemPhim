import { Prisma } from '../../../generated/prisma/client';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceNotFoundRepositoryError,
} from '../../workspaces/repositories/workspace.repository';
import {
  BuildingArchivedRepositoryError,
  BuildingNotFoundRepositoryError,
  BuildingRepository,
} from './building.repository';

describe('BuildingRepository', () => {
  const input = {
    name: 'Nhà trọ An Bình',
    addressLine1: '12 Nguyễn Trãi',
    city: 'Hồ Chí Minh',
    latitude: 10.762622,
    longitude: 106.660172,
  };

  it('rechecks workspace and OWNER membership before creating', async () => {
    const created = { id: 'building-1', workspaceId: 'workspace-1' };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      building: { create: jest.fn().mockResolvedValue(created) },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new BuildingRepository(prisma as never);

    await expect(repository.create('workspace-1', 'owner-1', input)).resolves.toBe(created);
    expect(transaction.building.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workspaceId: 'workspace-1', name: input.name }),
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('rejects creation in an archived workspace', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn() },
      building: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new BuildingRepository(prisma as never);

    await expect(repository.create('workspace-1', 'owner-1', input)).rejects.toBeInstanceOf(
      WorkspaceArchivedRepositoryError,
    );
    expect(transaction.building.create).not.toHaveBeenCalled();
  });

  it.each(['MANAGER', 'STAFF'] as const)(
    'rejects a historical %s membership during the transaction',
    async (role) => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([{ status: 'ACTIVE' }]),
        workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role }) },
        building: { create: jest.fn() },
      };
      const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
      const repository = new BuildingRepository(prisma as never);

      await expect(repository.create('workspace-1', 'legacy-member', input)).rejects.toBeInstanceOf(
        WorkspaceNotFoundRepositoryError,
      );
      expect(transaction.building.create).not.toHaveBeenCalled();
    },
  );

  it('always scopes list queries by workspace', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new BuildingRepository({ building: { findMany } } as never);

    await expect(repository.list('workspace-1')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('scopes detail queries by workspace and building id', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const repository = new BuildingRepository({ building: { findFirst } } as never);

    await expect(repository.detail('workspace-1', 'building-1')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'building-1', workspaceId: 'workspace-1' },
    });
  });

  it('locks workspace/building and scopes an update to an ACTIVE building', async () => {
    const updatedBuilding = { id: 'building-1', workspaceId: 'workspace-1', status: 'ACTIVE' };
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'building-1', status: 'ACTIVE' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      building: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(updatedBuilding),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new BuildingRepository(prisma as never);

    await expect(
      repository.update('workspace-1', 'owner-1', 'building-1', { name: 'Updated' }),
    ).resolves.toBe(updatedBuilding);
    expect(transaction.building.updateMany).toHaveBeenCalledWith({
      where: { id: 'building-1', workspaceId: 'workspace-1', status: 'ACTIVE' },
      data: { name: 'Updated' },
    });
  });

  it('blocks updates to an archived building', async () => {
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'building-1', status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      building: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new BuildingRepository(prisma as never);

    await expect(
      repository.update('workspace-1', 'owner-1', 'building-1', { name: 'Updated' }),
    ).rejects.toBeInstanceOf(BuildingArchivedRepositoryError);
    expect(transaction.building.updateMany).not.toHaveBeenCalled();
  });

  it('archives idempotently under workspace and building row locks', async () => {
    const archived = { id: 'building-1', workspaceId: 'workspace-1', status: 'ARCHIVED' };
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([{ id: 'building-1', status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      building: {
        updateMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(archived),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new BuildingRepository(prisma as never);

    await expect(repository.archive('workspace-1', 'owner-1', 'building-1')).resolves.toBe(
      archived,
    );
    expect(transaction.building.updateMany).not.toHaveBeenCalled();
  });

  it('returns not found when a building is outside the workspace', async () => {
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ status: 'ACTIVE' }])
        .mockResolvedValueOnce([]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      building: { updateMany: jest.fn(), findFirst: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new BuildingRepository(prisma as never);

    await expect(
      repository.restore('workspace-1', 'owner-1', 'building-other-workspace'),
    ).rejects.toBeInstanceOf(BuildingNotFoundRepositoryError);
  });
});
