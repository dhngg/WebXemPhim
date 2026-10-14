import { Prisma } from '../../../generated/prisma/client';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceMemberNotFoundRepositoryError,
  WorkspaceNotFoundRepositoryError,
  WorkspaceOwnerConflictRepositoryError,
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
      user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      workspace: { create: jest.fn().mockResolvedValue(workspace) },
      workspaceMembership: { create: jest.fn().mockResolvedValue({}) },
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

  it('locks the workspace and atomically demotes then promotes during ownership transfer', async () => {
    const demote = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-owner', role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'membership-2',
          userId: 'owner-2',
          role: 'MANAGER',
          user: { status: 'ACTIVE' },
        }),
        updateMany: demote,
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await repository.transferOwnership(workspace.id, 'owner-1', 'membership-2');

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(demote).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'membership-owner',
        workspaceId: workspace.id,
        userId: 'owner-1',
        role: 'OWNER',
      },
      data: { role: 'MANAGER' },
    });
    expect(demote).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'membership-2',
        workspaceId: workspace.id,
        userId: 'owner-2',
        role: { in: ['MANAGER', 'STAFF'] },
        user: { status: 'ACTIVE' },
      },
      data: { role: 'OWNER' },
    });
    expect(demote.mock.invocationCallOrder[0]).toBeLessThan(demote.mock.invocationCallOrder[1]!);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('aborts transfer when the current OWNER cannot be claimed', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-owner', role: 'MANAGER' }),
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.transferOwnership(workspace.id, 'stale-owner', 'membership-2'),
    ).rejects.toBeInstanceOf(WorkspaceOwnerConflictRepositoryError);
    expect(transaction.workspaceMembership.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    [
      'disabled',
      {
        id: 'membership-2',
        userId: 'owner-2',
        role: 'MANAGER',
        user: { status: 'DISABLED' },
      },
    ],
  ] as const)('rejects a %s target membership', async (_case, target) => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: 'membership-owner', role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue(target),
        updateMany: jest.fn(),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.transferOwnership(workspace.id, 'owner-1', 'membership-2'),
    ).rejects.toBeInstanceOf(WorkspaceMemberNotFoundRepositoryError);
    expect(transaction.workspaceMembership.updateMany).not.toHaveBeenCalled();
  });

  it('serializes concurrent transfer requests so only one current-OWNER claim succeeds', async () => {
    const targets = new Map([
      [
        'membership-2',
        {
          id: 'membership-2',
          userId: 'owner-2',
          role: 'MANAGER',
          user: { status: 'ACTIVE' },
        },
      ],
      [
        'membership-3',
        {
          id: 'membership-3',
          userId: 'owner-3',
          role: 'STAFF',
          user: { status: 'ACTIVE' },
        },
      ],
    ]);
    let currentOwner = 'owner-1';
    let serialized = Promise.resolve<unknown>(undefined);
    const prisma = {
      $transaction: jest.fn((operation) => {
        const run = serialized.then(async () => {
          const transaction = {
            $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
            workspaceMembership: {
              findUnique: jest.fn(({ where }) =>
                Promise.resolve({
                  id: `membership-${where.workspaceId_userId.userId}`,
                  role: where.workspaceId_userId.userId === currentOwner ? 'OWNER' : 'MANAGER',
                }),
              ),
              findFirst: jest.fn(({ where }) => Promise.resolve(targets.get(where.id) ?? null)),
              updateMany: jest.fn(({ where, data }) => {
                if (data.role === 'MANAGER') {
                  if (where.userId !== currentOwner) return Promise.resolve({ count: 0 });
                  currentOwner = '';
                  return Promise.resolve({ count: 1 });
                }
                currentOwner = where.userId;
                return Promise.resolve({ count: 1 });
              }),
            },
          };
          return operation(transaction);
        });
        serialized = run.catch(() => undefined);
        return run;
      }),
    };
    const repository = new WorkspaceRepository(prisma as never);

    const results = await Promise.allSettled([
      repository.transferOwnership(workspace.id, 'owner-1', 'membership-2'),
      repository.transferOwnership(workspace.id, 'owner-1', 'membership-3'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(WorkspaceOwnerConflictRepositoryError) });
    expect(['owner-2', 'owner-3']).toContain(currentOwner);
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

  it('does not update an ACTIVE workspace when restore is retried', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ACTIVE' }]),
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(workspace),
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
      workspace: { findUnique: jest.fn(), update: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.archive(workspace.id, 'manager-1')).rejects.toBeInstanceOf(
      WorkspaceNotFoundRepositoryError,
    );
    expect(transaction.workspace.update).not.toHaveBeenCalled();
  });

  it('reports an archived workspace when a business ownership write is attempted', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspace.id, status: 'ARCHIVED' }]),
      workspaceMembership: { findUnique: jest.fn(), updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.transferOwnership(workspace.id, 'owner-1', 'membership-2'),
    ).rejects.toBeInstanceOf(WorkspaceArchivedRepositoryError);
    expect(transaction.workspaceMembership.updateMany).not.toHaveBeenCalled();
  });
});
