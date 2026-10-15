import { Prisma } from '../../../generated/prisma/client';
import {
  WorkspaceApplicationRequiredRepositoryError,
  WorkspaceActiveOwnershipLimitRepositoryError,
  WorkspaceNotFoundRepositoryError,
  WorkspaceRepository,
} from './workspace.repository';

describe('WorkspaceRepository', () => {
  const workspace = {
    id: '770060ca-e063-4b27-9b10-e517ba61866e',
    name: 'Workspace A',
    status: 'ACTIVE' as const,
    archivedAt: null,
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
  };

  it('creates the workspace and its OWNER in one serializable transaction', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      workspace: {
        create: jest.fn().mockResolvedValue(workspace),
        count: jest.fn().mockResolvedValue(0),
      },
      workspaceMembership: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ id: 'legacy-owner' }),
      },
      landlordApplication: { findFirst: jest.fn(), update: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (operation) => operation(transaction)),
    };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.createWithOwner('user-1', 'Workspace A')).resolves.toEqual({
      ...workspace,
      role: 'OWNER',
    });
    expect(transaction.workspaceMembership.create).toHaveBeenCalledWith({
      data: { workspaceId: workspace.id, userId: 'user-1', role: 'OWNER' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('blocks first workspace creation without an approved application', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      workspace: { create: jest.fn(), count: jest.fn() },
      workspaceMembership: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      landlordApplication: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    const repository = new WorkspaceRepository({
      $transaction: jest.fn(async (operation) => operation(transaction)),
    } as never);

    await expect(repository.createWithOwner('new-user', 'Workspace A')).rejects.toBeInstanceOf(
      WorkspaceApplicationRequiredRepositoryError,
    );
    expect(transaction.workspace.create).not.toHaveBeenCalled();
    expect(transaction.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('blocks creating another ACTIVE workspace while preserving the existing OWNER membership', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      workspace: { create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      workspaceMembership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'legacy-owner' }),
        create: jest.fn(),
      },
      landlordApplication: { findFirst: jest.fn(), update: jest.fn() },
    };
    const repository = new WorkspaceRepository({
      $transaction: jest.fn(async (operation) => operation(transaction)),
    } as never);

    await expect(
      repository.createWithOwner('legacy-owner-user', 'Workspace B'),
    ).rejects.toBeInstanceOf(WorkspaceActiveOwnershipLimitRepositoryError);
    expect(transaction.workspace.count).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        memberships: { some: { userId: 'legacy-owner-user', role: 'OWNER' } },
      },
    });
    expect(transaction.workspace.create).not.toHaveBeenCalled();
  });

  it('does not create an additional workspace for a legacy OWNER with multiple workspaces', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      workspace: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(2),
      },
      workspaceMembership: {
        findFirst: jest.fn().mockResolvedValue({ id: 'legacy-owner' }),
        create: jest.fn(),
      },
      landlordApplication: { findFirst: jest.fn(), update: jest.fn() },
    };
    const repository = new WorkspaceRepository({
      $transaction: jest.fn(async (operation) => operation(transaction)),
    } as never);

    await expect(
      repository.createWithOwner('legacy-owner-user', 'Workspace C'),
    ).rejects.toBeInstanceOf(WorkspaceActiveOwnershipLimitRepositoryError);
    expect(transaction.workspace.create).not.toHaveBeenCalled();
  });

  it('lists only OWNER memberships for the V1 landlord workspace surface', async () => {
    const prisma = {
      workspaceMembership: {
        findMany: jest.fn().mockResolvedValue([{ workspace, role: 'OWNER' }]),
      },
    };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.findForUser('user-1')).resolves.toEqual([
      { ...workspace, role: 'OWNER' },
    ]);
    expect(prisma.workspaceMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', role: 'OWNER' } }),
    );
  });

  it.each(['MANAGER', 'STAFF'] as const)(
    'does not expose an accessible workspace for a historical %s membership',
    async (role) => {
      const prisma = {
        workspaceMembership: {
          findUnique: jest.fn().mockResolvedValue({ workspace, role }),
        },
      };
      const repository = new WorkspaceRepository(prisma as never);

      await expect(
        repository.findAccessibleWorkspace('legacy-user', workspace.id),
      ).resolves.toBeNull();
    },
  );

  it('blocks every retired member-management and ownership-transfer repository path without touching Prisma', async () => {
    const prisma = { $transaction: jest.fn() };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.listMembers(workspace.id, 'owner-1')).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    await expect(
      repository.addMember(workspace.id, 'owner-1', 'manager@example.com', 'MANAGER'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundRepositoryError);
    await expect(
      repository.updateMemberRole(workspace.id, 'owner-1', 'membership-2', 'STAFF'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundRepositoryError);
    await expect(
      repository.removeMember(workspace.id, 'owner-1', 'membership-2'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundRepositoryError);
    await expect(
      repository.transferOwnership(workspace.id, 'owner-1', 'membership-2'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundRepositoryError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('archives an ACTIVE workspace under a row lock without changing memberships', async () => {
    const archived = {
      ...workspace,
      status: 'ARCHIVED' as const,
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(archived),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.archive(workspace.id, 'owner-1')).resolves.toEqual({
      ...archived,
      role: 'OWNER',
    });
    expect(transaction.workspace.update).toHaveBeenCalledWith({
      where: { id: workspace.id },
      data: { status: 'ARCHIVED', archivedAt: expect.any(Date) },
    });
    expect(transaction.workspaceMembership.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('keeps the original archive state when archive is retried', async () => {
    const archived = {
      ...workspace,
      status: 'ARCHIVED' as const,
      archivedAt: new Date('2026-10-14T01:00:00.000Z'),
    };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ARCHIVED' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(archived),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.archive(workspace.id, 'owner-1')).resolves.toEqual({
      ...archived,
      role: 'OWNER',
    });
    expect(transaction.workspace.update).not.toHaveBeenCalled();
  });

  it('restores an ARCHIVED workspace and clears archivedAt', async () => {
    const restored = { ...workspace, updatedAt: new Date('2026-10-14T02:00:00.000Z') };
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ARCHIVED' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      workspace: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue(restored),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.restore(workspace.id, 'owner-1')).resolves.toEqual({
      ...restored,
      role: 'OWNER',
    });
    expect(transaction.workspace.update).toHaveBeenCalledWith({
      where: { id: workspace.id },
      data: { status: 'ACTIVE', archivedAt: null },
    });
  });

  it('blocks restoring when another ACTIVE workspace is already owned', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
      workspace: {
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
    };
    const repository = new WorkspaceRepository({
      $transaction: jest.fn(async (operation) => operation(transaction)),
    } as never);

    await expect(repository.restore(workspace.id, 'owner-1')).rejects.toBeInstanceOf(
      WorkspaceActiveOwnershipLimitRepositoryError,
    );
    expect(transaction.workspace.update).not.toHaveBeenCalled();
  });

  it('does not update an ACTIVE workspace when restore is retried', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(workspace),
        count: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.restore(workspace.id, 'owner-1')).resolves.toEqual({
      ...workspace,
      role: 'OWNER',
    });
    expect(transaction.workspace.update).not.toHaveBeenCalled();
  });

  it('rechecks OWNER inside the lifecycle transaction', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'MANAGER' }),
      },
      workspace: { findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.archive(workspace.id, 'manager-1')).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    expect(transaction.workspace.update).not.toHaveBeenCalled();
  });
});
