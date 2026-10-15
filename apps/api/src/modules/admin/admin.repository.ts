import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { isSerializationFailure } from '../../database/serialization-failure';

export class AdminUserNotFoundRepositoryError extends Error {}
export class AdminListingNotFoundRepositoryError extends Error {}
export class AdminTargetProtectedRepositoryError extends Error {}
export class AdminStateUnchangedRepositoryError extends Error {}
export class AdminNotAuthorizedRepositoryError extends Error {}

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const MAX_ATTEMPTS = 4;

/** Retries serialization failures so the loser re-evaluates against committed state. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}

@Injectable()
export class AdminRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- accounts ----
  async listUsers(query: {
    status?: 'ACTIVE' | 'DISABLED';
    search?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { email: { contains: query.search.toLowerCase() } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: { ...userSelect, platformAdmin: { select: { userId: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...userSelect,
        platformAdmin: { select: { userId: true } },
        _count: { select: { memberships: true } },
      },
    });
    if (!user) throw new AdminUserNotFoundRepositoryError();
    const [activeSessions, lastAction] = await this.prisma.$transaction([
      this.prisma.authSession.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
      this.prisma.adminAuditLog.findFirst({
        where: { targetType: 'USER', targetId: id, action: { in: ['USER_LOCK', 'USER_UNLOCK'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { reason: true },
      }),
    ]);
    return { user, activeSessions, lastReason: lastAction?.reason ?? null };
  }

  setUserLock(actorId: string, targetId: string, lock: boolean, reason: string) {
    return withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.requireAdmin(tx, actorId);
        if (actorId === targetId) throw new AdminTargetProtectedRepositoryError();
        const rows = await tx.$queryRaw<{ status: 'ACTIVE' | 'DISABLED' }[]>(
          Prisma.sql`SELECT "status" FROM "users" WHERE "id" = ${targetId}::uuid FOR UPDATE`,
        );
        const target = rows[0];
        if (!target) throw new AdminUserNotFoundRepositoryError();
        const isAdmin = await tx.platformAdmin.findUnique({ where: { userId: targetId } });
        if (lock && isAdmin) throw new AdminTargetProtectedRepositoryError();
        const next = lock ? 'DISABLED' : 'ACTIVE';
        if (target.status === next) throw new AdminStateUnchangedRepositoryError();
        const now = new Date();
        await tx.user.update({
          where: { id: targetId },
          data: { status: next, disabledAt: lock ? now : null },
        });
        let revoked = 0;
        if (lock) {
          revoked = (
            await tx.authSession.updateMany({
              where: { userId: targetId, revokedAt: null },
              data: { revokedAt: now, revokeReason: 'USER_DISABLED' },
            })
          ).count;
        }
        await tx.adminAuditLog.create({
          data: {
            actorUserId: actorId,
            action: lock ? 'USER_LOCK' : 'USER_UNLOCK',
            targetType: 'USER',
            targetId,
            reason,
            metadata: { previousStatus: target.status, newStatus: next, revokedSessions: revoked },
          },
        });
        return this.getUserTx(tx, targetId);
      }, SERIALIZABLE),
    );
  }

  private async getUserTx(tx: Prisma.TransactionClient, id: string) {
    return tx.user.findUniqueOrThrow({
      where: { id },
      select: { ...userSelect, platformAdmin: { select: { userId: true } } },
    });
  }

  private async requireAdmin(tx: Prisma.TransactionClient, userId: string) {
    const admin = await tx.platformAdmin.findUnique({
      where: { userId },
      select: { user: { select: { status: true } } },
    });
    if (!admin || admin.user.status !== 'ACTIVE') throw new AdminNotAuthorizedRepositoryError();
  }

  // ---- listings ----
  async listListings(query: {
    hidden?: boolean;
    published?: boolean;
    workspaceId?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.ListingWhereInput = {
      ...(query.published === undefined ? {} : { isPublished: query.published }),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(query.hidden === undefined
        ? {}
        : query.hidden
          ? { moderation: { is: { isHidden: true } } }
          : { NOT: { moderation: { is: { isHidden: true } } } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: listingSelect,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return { items, total };
  }

  setListingHidden(actorId: string, listingId: string, hidden: boolean, reason: string) {
    return withRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.requireAdmin(tx, actorId);
        const rows = await tx.$queryRaw<{ workspace_id: string; room_id: string }[]>(
          Prisma.sql`SELECT "workspace_id", "room_id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR SHARE`,
        );
        const listing = rows[0];
        if (!listing) throw new AdminListingNotFoundRepositoryError();
        const current = await tx.listingModeration.findUnique({ where: { listingId } });
        if ((current?.isHidden ?? false) === hidden) throw new AdminStateUnchangedRepositoryError();
        await tx.listingModeration.upsert({
          where: { listingId },
          create: { listingId, isHidden: hidden, reason, updatedBy: actorId },
          update: { isHidden: hidden, reason, updatedBy: actorId, updatedAt: new Date() },
        });
        await tx.adminAuditLog.create({
          data: {
            actorUserId: actorId,
            action: hidden ? 'LISTING_HIDE' : 'LISTING_RESTORE',
            targetType: 'LISTING',
            targetId: listingId,
            reason,
            metadata: { workspaceId: listing.workspace_id, roomId: listing.room_id },
          },
        });
        return tx.listing.findUniqueOrThrow({ where: { id: listingId }, select: listingSelect });
      }, SERIALIZABLE),
    );
  }

  // ---- audit ----
  async listAudit(query: {
    actorUserId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
    from?: Date;
    to?: Date;
    page: number;
    limit: number;
  }) {
    const where: Prisma.AdminAuditLogWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lt: query.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return { items, total };
  }
}

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  status: true,
  disabledAt: true,
  createdAt: true,
} as const;

const listingSelect = {
  id: true,
  workspaceId: true,
  roomId: true,
  isPublished: true,
  room: {
    select: {
      code: true,
      monthlyRent: true,
      building: { select: { name: true, city: true } },
    },
  },
  moderation: { select: { isHidden: true, reason: true, updatedAt: true } },
} as const;
