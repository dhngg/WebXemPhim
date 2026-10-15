import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { isSerializationFailure } from '../../../database/serialization-failure';

export const PASSWORD_RESET_TTL_MINUTES = 20;
/** A new token is issued for an account at most once per this many seconds (mail-bomb guard). */
export const PASSWORD_RESET_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const serializable = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export class ResetTokenInvalidRepositoryError extends Error {}

@Injectable()
export class PasswordResetRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues a token for an ACTIVE user and supersedes any live one. Returns the recipient address,
   * or null when nothing was issued (unknown/disabled account, cooldown, or a concurrent request
   * already issued one) — the caller must treat all of those identically.
   */
  async issue(email: string, tokenHash: Uint8Array<ArrayBuffer>, now: Date) {
    return this.retry(async () => {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({
            where: { email },
            select: { id: true, email: true, status: true },
          });
          if (!user || user.status !== 'ACTIVE') return null;
          const latest = await tx.passwordResetToken.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          });
          if (
            latest &&
            now.getTime() - latest.createdAt.getTime() < PASSWORD_RESET_COOLDOWN_SECONDS * 1000
          )
            return null;
          await tx.passwordResetToken.updateMany({
            where: { userId: user.id, consumedAt: null },
            data: { consumedAt: now },
          });
          await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash,
              createdAt: now,
              expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000),
            },
          });
          return { email: user.email };
        }, serializable);
      } catch (error) {
        // Concurrent request won the one-live-token unique index: it already sent a link.
        if ((error as { code?: string }).code === 'P2002') return null;
        throw error;
      }
    });
  }

  /**
   * Single-use redemption. The conditional update is the atomic claim: only one of any number of
   * concurrent requests can flip consumed_at, so replays and races lose. Sessions are revoked in the
   * same transaction, so the new password and the loss of old sessions commit together.
   */
  async redeem(tokenHash: Uint8Array<ArrayBuffer>, passwordHash: string, now: Date) {
    return this.retry(() =>
      this.prisma.$transaction(async (tx) => {
        const claimed = await tx.passwordResetToken.updateMany({
          where: { tokenHash, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (claimed.count !== 1) throw new ResetTokenInvalidRepositoryError();
        const token = await tx.passwordResetToken.findUniqueOrThrow({
          where: { tokenHash },
          select: { userId: true },
        });
        // A disabled account must not regain access through a reset link: roll the claim back.
        const user = await tx.user.findUnique({
          where: { id: token.userId },
          select: { status: true },
        });
        if (user?.status !== 'ACTIVE') throw new ResetTokenInvalidRepositoryError();
        await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
        await tx.passwordResetToken.updateMany({
          where: { userId: token.userId, consumedAt: null },
          data: { consumedAt: now },
        });
        const revoked = await tx.authSession.updateMany({
          where: { userId: token.userId, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'LOGOUT_ALL' },
        });
        return { userId: token.userId, revokedSessions: revoked.count };
      }, serializable),
    );
  }

  private async retry<T>(run: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        if (!isSerializationFailure(error) || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }
}
