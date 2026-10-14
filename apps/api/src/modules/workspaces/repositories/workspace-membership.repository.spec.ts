import { Prisma } from '../../../generated/prisma/client';
import {
  WorkspaceArchivedRepositoryError,
  WorkspaceMemberAlreadyExistsRepositoryError,
  WorkspaceMemberNotFoundRepositoryError,
  WorkspaceNotFoundRepositoryError,
  WorkspaceOwnerProtectedRepositoryError,
  WorkspaceRepository,
} from './workspace.repository';

describe('WorkspaceRepository membership management', () => {
  const workspaceId = '770060ca-e063-4b27-9b10-e517ba61866e';
  const ownerUserId = '1248d89d-42cc-4db1-8855-813d4ad15f08';
  const memberUserId = '25dc48f1-71e6-4ad1-9c2f-29db4b565f73';
  const membership = {
    id: 'b5f3ea0b-7158-4bd7-aee0-cbf6d274302c',
    workspaceId,
    userId: memberUserId,
    role: 'MANAGER' as const,
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    user: { id: memberUserId, email: 'member@example.com', displayName: 'Member' },
  };

  type TestTransaction = {
    $queryRaw: jest.Mock;
    user: { findUnique: jest.Mock };
    workspaceMembership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  function writableTransaction(
    overrides: {
      user?: Partial<TestTransaction['user']>;
      workspaceMembership?: Partial<TestTransaction['workspaceMembership']>;
    } = {},
  ): TestTransaction {
    return {
      $queryRaw: jest.fn().mockResolvedValue([{ id: workspaceId, status: 'ACTIVE' }]),
      user: {
        findUnique: jest.fn(),
        ...overrides.user,
      },
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
        ...overrides.workspaceMembership,
      },
    };
  }

  it('lists members only after rechecking the OWNER membership in the database', async () => {
    const transaction = {
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({
          role: 'OWNER',
          workspace: { id: workspaceId },
        }),
        findMany: jest.fn().mockResolvedValue([membership]),
      },
    };
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(repository.listMembers(workspaceId, ownerUserId)).resolves.toEqual([membership]);
    expect(transaction.workspaceMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId } }),
    );
  });

  it('adds an ACTIVE registered user with a non-owner role inside a serialized transaction', async () => {
    const transaction = writableTransaction({
      user: { findUnique: jest.fn().mockResolvedValue({ id: memberUserId, status: 'ACTIVE' }) },
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        create: jest.fn().mockResolvedValue(membership),
      },
    });
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.addMember(workspaceId, ownerUserId, 'member@example.com', 'MANAGER'),
    ).resolves.toEqual(membership);
    expect(transaction.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'member@example.com' },
      select: { id: true, status: true },
    });
    expect(transaction.workspaceMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { workspaceId, userId: memberUserId, role: 'MANAGER' },
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('maps a concurrent duplicate membership to a stable conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate membership', {
      code: 'P2002',
      clientVersion: '7.10.0',
    });
    const prisma = { $transaction: jest.fn().mockRejectedValue(duplicate) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.addMember(workspaceId, ownerUserId, 'member@example.com', 'STAFF'),
    ).rejects.toBeInstanceOf(WorkspaceMemberAlreadyExistsRepositoryError);
  });

  it.each([
    ['missing', null],
    ['disabled', { id: memberUserId, status: 'DISABLED' }],
  ] as const)(
    'does not expose a %s account through add-member behavior',
    async (_case, unavailableUser) => {
      const transaction = writableTransaction({
        user: { findUnique: jest.fn().mockResolvedValue(unavailableUser) },
        workspaceMembership: {
          findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
          create: jest.fn(),
        },
      });
      const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
      const repository = new WorkspaceRepository(prisma as never);

      await expect(
        repository.addMember(workspaceId, ownerUserId, 'member@example.com', 'STAFF'),
      ).rejects.toBeInstanceOf(WorkspaceMemberNotFoundRepositoryError);
      expect(transaction.workspaceMembership.create).not.toHaveBeenCalled();
    },
  );

  it('refuses to change or remove the OWNER membership', async () => {
    const updateTransaction = writableTransaction({
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue({ ...membership, role: 'OWNER' }),
        update: jest.fn(),
      },
    });
    const removeTransaction = writableTransaction({
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue({ id: membership.id, role: 'OWNER' }),
        deleteMany: jest.fn(),
      },
    });
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (operation) => operation(updateTransaction))
        .mockImplementationOnce(async (operation) => operation(removeTransaction)),
    };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.updateMemberRole(workspaceId, ownerUserId, membership.id, 'STAFF'),
    ).rejects.toBeInstanceOf(WorkspaceOwnerProtectedRepositoryError);
    await expect(
      repository.removeMember(workspaceId, ownerUserId, membership.id),
    ).rejects.toBeInstanceOf(WorkspaceOwnerProtectedRepositoryError);
    expect(updateTransaction.workspaceMembership.update).not.toHaveBeenCalled();
    expect(removeTransaction.workspaceMembership.deleteMany).not.toHaveBeenCalled();
  });

  it('updates a MANAGER/STAFF role idempotently and removes only a non-owner membership', async () => {
    const sameRoleTransaction = writableTransaction({
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue(membership),
        update: jest.fn(),
      },
    });
    const removeTransaction = writableTransaction({
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue({ id: membership.id, role: 'STAFF' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    });
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (operation) => operation(sameRoleTransaction))
        .mockImplementationOnce(async (operation) => operation(removeTransaction)),
    };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.updateMemberRole(workspaceId, ownerUserId, membership.id, 'MANAGER'),
    ).resolves.toEqual(membership);
    expect(sameRoleTransaction.workspaceMembership.update).not.toHaveBeenCalled();
    await expect(
      repository.removeMember(workspaceId, ownerUserId, membership.id),
    ).resolves.toBeUndefined();
    expect(removeTransaction.workspaceMembership.deleteMany).toHaveBeenCalledWith({
      where: { id: membership.id, workspaceId, role: { not: 'OWNER' } },
    });
  });

  it('changes a non-owner membership between MANAGER and STAFF', async () => {
    const changed = { ...membership, role: 'STAFF' as const };
    const transaction = writableTransaction({
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
        findFirst: jest.fn().mockResolvedValue(membership),
        update: jest.fn().mockResolvedValue(changed),
      },
    });
    const prisma = { $transaction: jest.fn(async (operation) => operation(transaction)) };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.updateMemberRole(workspaceId, ownerUserId, membership.id, 'STAFF'),
    ).resolves.toEqual(changed);
    expect(transaction.workspaceMembership.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: membership.id },
        data: { role: 'STAFF' },
      }),
    );
  });

  it('blocks writes on archived workspaces and rechecks the requesting OWNER', async () => {
    const archivedTransaction = writableTransaction();
    archivedTransaction.$queryRaw.mockResolvedValue([{ id: workspaceId, status: 'ARCHIVED' }]);
    const nonOwnerTransaction = writableTransaction({
      workspaceMembership: {
        findUnique: jest.fn().mockResolvedValue({ role: 'MANAGER' }),
        findFirst: jest.fn(),
      },
    });
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (operation) => operation(archivedTransaction))
        .mockImplementationOnce(async (operation) => operation(nonOwnerTransaction)),
    };
    const repository = new WorkspaceRepository(prisma as never);

    await expect(
      repository.addMember(workspaceId, ownerUserId, 'member@example.com', 'STAFF'),
    ).rejects.toBeInstanceOf(WorkspaceArchivedRepositoryError);
    await expect(
      repository.updateMemberRole(workspaceId, ownerUserId, membership.id, 'STAFF'),
    ).rejects.toBeInstanceOf(WorkspaceNotFoundRepositoryError);
  });
});
