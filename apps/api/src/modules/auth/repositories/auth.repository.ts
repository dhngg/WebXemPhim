import { Injectable } from '@nestjs/common';
import { Prisma, type UserStatus } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface NewSessionInput {
  familyId: string;
  tokenHash: Uint8Array<ArrayBuffer>;
  expiresAt: Date;
}

export type RefreshRotationResult =
  | { outcome: 'ROTATED'; user: AuthUserRecord; familyId: string; expiresAt: Date }
  | { outcome: 'ALREADY_ROTATED' | 'REUSE' | 'INVALID' | 'EXPIRED' | 'DISABLED' };

export class EmailAlreadyExistsRepositoryError extends Error {}
export class UserUnavailableRepositoryError extends Error {
  constructor(readonly reason: 'MISSING' | 'DISABLED') {
    super('User is unavailable');
  }
}

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithSession(
    input: { email: string; passwordHash: string; displayName?: string },
    session: NewSessionInput,
  ): Promise<AuthUserRecord> {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const user = await transaction.user.create({
            data: {
              email: input.email,
              passwordHash: input.passwordHash,
              ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
              status: 'ACTIVE',
            },
          });
          await transaction.authSession.create({ data: { userId: user.id, ...session } });
          return user;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isEmailUniqueViolation(error)) throw new EmailAlreadyExistsRepositoryError();
      throw error;
    }
  }

  findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findSessionFamilyByTokenHash(
    tokenHash: Uint8Array<ArrayBuffer>,
  ): Promise<{ familyId: string } | null> {
    return this.prisma.authSession.findUnique({ where: { tokenHash }, select: { familyId: true } });
  }

  async createSessionForActiveUser(userId: string, session: NewSessionInput): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { status: true },
        });
        if (!user) throw new UserUnavailableRepositoryError('MISSING');
        if (user.status !== 'ACTIVE') throw new UserUnavailableRepositoryError('DISABLED');
        await transaction.authSession.create({ data: { userId, ...session } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  rotateRefreshToken(
    currentTokenHash: Uint8Array<ArrayBuffer>,
    nextTokenHash: Uint8Array<ArrayBuffer>,
    now: Date,
    graceMilliseconds: number,
  ): Promise<RefreshRotationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.authSession.findUnique({
        where: { tokenHash: currentTokenHash },
        include: { user: true },
      });
      if (!current) return { outcome: 'INVALID' };
      if (current.user.status !== 'ACTIVE') {
        await transaction.authSession.updateMany({
          where: { userId: current.userId, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'USER_DISABLED' },
        });
        return { outcome: 'DISABLED' };
      }
      const consumed = await classifyConsumedSession(transaction, current, now, graceMilliseconds);
      if (consumed) return consumed;

      const claimed = await transaction.authSession.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now, revokeReason: 'ROTATED', lastUsedAt: now },
      });
      if (claimed.count !== 1) {
        const latest = await transaction.authSession.findUnique({
          where: { id: current.id },
          include: { user: true },
        });
        if (!latest) return { outcome: 'INVALID' };
        return (
          (await classifyConsumedSession(transaction, latest, now, graceMilliseconds)) ?? {
            outcome: 'INVALID',
          }
        );
      }

      const next = await transaction.authSession.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: nextTokenHash,
          parentSessionId: current.id,
          expiresAt: current.expiresAt,
        },
      });
      await transaction.authSession.update({
        where: { id: current.id },
        data: { replacedBySessionId: next.id },
      });
      return {
        outcome: 'ROTATED',
        user: current.user,
        familyId: current.familyId,
        expiresAt: current.expiresAt,
      };
    });
  }

  async revokeFamilyByTokenHash(tokenHash: Uint8Array<ArrayBuffer>, now: Date): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.authSession.findUnique({
        where: { tokenHash },
        select: { familyId: true },
      });
      if (!session) return;
      await transaction.authSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'LOGOUT' },
      });
    });
  }

  async revokeAllUserSessions(userId: string, now: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'LOGOUT_ALL' },
    });
  }
}

type AuthTransaction = Prisma.TransactionClient;
type SessionWithUser = Prisma.AuthSessionGetPayload<{ include: { user: true } }>;

async function classifyConsumedSession(
  transaction: AuthTransaction,
  session: SessionWithUser,
  now: Date,
  graceMilliseconds: number,
): Promise<RefreshRotationResult | undefined> {
  if (session.expiresAt.getTime() <= now.getTime()) return { outcome: 'EXPIRED' };
  if (!session.revokedAt) return undefined;
  if (session.revokeReason !== 'ROTATED') return { outcome: 'INVALID' };
  if (now.getTime() - session.revokedAt.getTime() <= graceMilliseconds) {
    return { outcome: 'ALREADY_ROTATED' };
  }
  await transaction.authSession.updateMany({
    where: { familyId: session.familyId, revokedAt: null },
    data: { revokedAt: now, revokeReason: 'REUSE' },
  });
  return { outcome: 'REUSE' };
}

function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const metadata = JSON.stringify(error.meta ?? {}).toLowerCase();
  return metadata.includes('email') || metadata.includes('users_email_key');
}
