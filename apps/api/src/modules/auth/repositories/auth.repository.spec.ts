import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../database/prisma/prisma.service';
import {
  AuthRepository,
  EmailAlreadyExistsRepositoryError,
  UserUnavailableRepositoryError,
} from './auth.repository';

const user = {
  id: 'a4c60e9e-5f9d-4a10-b7ab-c1d663c19f5c',
  email: 'user@example.com',
  passwordHash: 'encoded-hash',
  displayName: null,
  status: 'ACTIVE' as const,
  disabledAt: null,
  createdAt: new Date('2026-10-14T00:00:00.000Z'),
  updatedAt: new Date('2026-10-14T00:00:00.000Z'),
};
const session = {
  familyId: '2d565a63-67d0-4df4-a244-1b1017f26353',
  tokenHash: new Uint8Array(32),
  expiresAt: new Date('2026-11-13T00:00:00.000Z'),
};

describe('AuthRepository', () => {
  it('creates user and first session in one serializable transaction', async () => {
    const transaction = {
      user: { create: jest.fn().mockResolvedValue(user) },
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const result = await new AuthRepository(prisma).createUserWithSession(
      { email: user.email, passwordHash: user.passwordHash },
      session,
    );
    expect(result).toBe(user);
    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: { userId: user.id, ...session },
    });
    expect((prisma.$transaction as jest.Mock).mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('maps only an email P2002 conflict to the public duplicate-email path', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('unique constraint', {
      code: 'P2002',
      clientVersion: '7.10.0',
      meta: { target: ['email'] },
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(duplicate),
    } as unknown as PrismaService;
    await expect(
      new AuthRepository(prisma).createUserWithSession(
        { email: user.email, passwordHash: user.passwordHash },
        session,
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsRepositoryError);
  });

  it('does not misreport unrelated database errors as duplicate email', async () => {
    const databaseError = new Error('connection failed');
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(databaseError),
    } as unknown as PrismaService;
    await expect(
      new AuthRepository(prisma).createUserWithSession(
        { email: user.email, passwordHash: user.passwordHash },
        session,
      ),
    ).rejects.toBe(databaseError);
  });

  it.each([
    [null, 'MISSING'],
    [{ status: 'DISABLED' }, 'DISABLED'],
  ] as const)('rejects session creation when user becomes unavailable', async (record, reason) => {
    const transaction = {
      user: { findUnique: jest.fn().mockResolvedValue(record) },
      authSession: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    await expect(
      new AuthRepository(prisma).createSessionForActiveUser(user.id, session),
    ).rejects.toMatchObject({ reason } satisfies Partial<UserUnavailableRepositoryError>);
    expect(transaction.authSession.create).not.toHaveBeenCalled();
  });

  it('rotates one generation atomically and preserves the family absolute expiry', async () => {
    const current = {
      id: 'a8324480-7c82-4568-a579-0138394c7c5d',
      userId: user.id,
      ...session,
      parentSessionId: null,
      replacedBySessionId: null,
      lastUsedAt: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
      user,
    };
    const next = { id: '33fd79db-90d8-4c57-bc2d-342a1352393e' };
    const transaction = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue(current),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue(next),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const newHash = new Uint8Array(32).fill(2);
    const now = new Date('2026-10-15T00:00:00.000Z');
    const result = await new AuthRepository(prisma).rotateRefreshToken(
      session.tokenHash,
      newHash,
      now,
      10_000,
    );
    expect(result).toMatchObject({
      outcome: 'ROTATED',
      familyId: session.familyId,
      expiresAt: session.expiresAt,
    });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokeReason: 'ROTATED', lastUsedAt: now },
    });
    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        familyId: session.familyId,
        tokenHash: newHash,
        parentSessionId: current.id,
        expiresAt: session.expiresAt,
      },
    });
  });

  it('classifies the conditional-update race loser within grace without revoking the family', async () => {
    const now = new Date('2026-10-15T00:00:10.000Z');
    const active = {
      id: 'a8324480-7c82-4568-a579-0138394c7c5d',
      userId: user.id,
      ...session,
      parentSessionId: null,
      replacedBySessionId: null,
      lastUsedAt: null,
      revokedAt: null,
      revokeReason: null,
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
      user,
    };
    const rotated = {
      ...active,
      revokedAt: new Date('2026-10-15T00:00:05.000Z'),
      revokeReason: 'ROTATED' as const,
    };
    const transaction = {
      authSession: {
        findUnique: jest.fn().mockResolvedValueOnce(active).mockResolvedValueOnce(rotated),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const result = await new AuthRepository(prisma).rotateRefreshToken(
      session.tokenHash,
      new Uint8Array(32).fill(2),
      now,
      10_000,
    );
    expect(result).toEqual({ outcome: 'ALREADY_ROTATED' });
    expect(transaction.authSession.updateMany).toHaveBeenCalledTimes(1);
    expect(transaction.authSession.create).not.toHaveBeenCalled();
  });

  it('allows only one of two concurrent rotation attempts to create a child generation', async () => {
    const now = new Date('2026-10-15T00:00:10.000Z');
    const state = {
      id: 'a8324480-7c82-4568-a579-0138394c7c5d',
      userId: user.id,
      ...session,
      parentSessionId: null,
      replacedBySessionId: null as string | null,
      lastUsedAt: null as Date | null,
      revokedAt: null as Date | null,
      revokeReason: null as 'ROTATED' | null,
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
    };
    const transaction = {
      authSession: {
        findUnique: jest.fn(async () => ({ ...state, user })),
        updateMany: jest.fn(
          async (args: {
            where: { id?: string };
            data: { revokedAt: Date; revokeReason: 'ROTATED'; lastUsedAt?: Date };
          }) => {
            if (!args.where.id || state.revokedAt) return { count: 0 };
            state.revokedAt = args.data.revokedAt;
            state.revokeReason = args.data.revokeReason;
            state.lastUsedAt = args.data.lastUsedAt ?? null;
            return { count: 1 };
          },
        ),
        create: jest.fn().mockResolvedValue({
          id: '33fd79db-90d8-4c57-bc2d-342a1352393e',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const repository = new AuthRepository(prisma);
    const outcomes = await Promise.all([
      repository.rotateRefreshToken(session.tokenHash, new Uint8Array(32).fill(2), now, 10_000),
      repository.rotateRefreshToken(session.tokenHash, new Uint8Array(32).fill(3), now, 10_000),
    ]);
    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual(['ALREADY_ROTATED', 'ROTATED']);
    expect(transaction.authSession.create).toHaveBeenCalledTimes(1);
  });

  it('revokes the active family when a rotated token is replayed outside grace', async () => {
    const now = new Date('2026-10-15T00:00:20.001Z');
    const rotated = {
      id: 'a8324480-7c82-4568-a579-0138394c7c5d',
      userId: user.id,
      ...session,
      parentSessionId: null,
      replacedBySessionId: null,
      lastUsedAt: new Date('2026-10-15T00:00:10.000Z'),
      revokedAt: new Date('2026-10-15T00:00:10.000Z'),
      revokeReason: 'ROTATED' as const,
      createdAt: new Date('2026-10-14T00:00:00.000Z'),
      user,
    };
    const transaction = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue(rotated),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const result = await new AuthRepository(prisma).rotateRefreshToken(
      session.tokenHash,
      new Uint8Array(32).fill(2),
      now,
      10_000,
    );
    expect(result).toEqual({ outcome: 'REUSE' });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'REUSE' },
    });
  });

  it('revokes every active session when refresh observes a disabled user', async () => {
    const now = new Date('2026-10-15T00:00:00.000Z');
    const transaction = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a8324480-7c82-4568-a579-0138394c7c5d',
          userId: user.id,
          ...session,
          revokedAt: null,
          user: { ...user, status: 'DISABLED' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService;
    const result = await new AuthRepository(prisma).rotateRefreshToken(
      session.tokenHash,
      new Uint8Array(32).fill(2),
      now,
      10_000,
    );
    expect(result).toEqual({ outcome: 'DISABLED' });
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'USER_DISABLED' },
    });
  });

  it('revokes only the located family for logout and all active user sessions for logout-all', async () => {
    const now = new Date('2026-10-15T00:00:00.000Z');
    const transaction = {
      authSession: {
        findUnique: jest.fn().mockResolvedValue({ familyId: session.familyId }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback) => callback(transaction)),
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    } as unknown as PrismaService;
    const repository = new AuthRepository(prisma);
    await repository.revokeFamilyByTokenHash(session.tokenHash, now);
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'LOGOUT' },
    });
    await repository.revokeAllUserSessions(user.id, now);
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'LOGOUT_ALL' },
    });
  });
});
