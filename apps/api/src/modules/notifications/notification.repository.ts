import { Injectable } from '@nestjs/common';
import type { Notification } from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';

export class NotificationNotFoundRepositoryError extends Error {}

/** Every query is keyed by the caller's user id; there is no way to address another user's row. */
@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: { unreadOnly: boolean; page: number; limit: number }) {
    const where = { userId, ...(query.unreadOnly ? { readAt: null } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** Idempotent: an already-read notification keeps its original read time. */
  async markRead(userId: string, id: string): Promise<Notification> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    const row = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!row) throw new NotificationNotFoundRepositoryError();
    return row;
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return result.count;
  }
}
