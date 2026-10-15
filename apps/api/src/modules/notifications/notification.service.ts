import { Injectable } from '@nestjs/common';
import type {
  MarkAllReadResponse,
  NotificationPageResponse,
  NotificationResponse,
  UnreadCountResponse,
} from '@rental/shared';
import type { Notification } from '../../generated/prisma/client';
import { ApplicationException } from '../../common/errors/application-exception';
import {
  NotificationNotFoundRepositoryError,
  NotificationRepository,
} from './notification.repository';
import type { NotificationQueryDto } from './notification.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async list(userId: string, query: NotificationQueryDto): Promise<NotificationPageResponse> {
    const { items, total } = await this.repository.list(userId, query);
    return { items: items.map(toResponse), total, page: query.page, limit: query.limit };
  }

  async unreadCount(userId: string): Promise<UnreadCountResponse> {
    return { unread: await this.repository.countUnread(userId) };
  }

  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    try {
      return toResponse(await this.repository.markRead(userId, id));
    } catch (error) {
      if (error instanceof NotificationNotFoundRepositoryError)
        throw new ApplicationException('NOTIFICATION_NOT_FOUND');
      throw error;
    }
  }

  async markAllRead(userId: string): Promise<MarkAllReadResponse> {
    return { updated: await this.repository.markAllRead(userId) };
  }
}

export function toResponse(n: Notification): NotificationResponse {
  return {
    id: n.id,
    workspaceId: n.workspaceId,
    type: n.type,
    entityType: n.entityType,
    entityId: n.entityId,
    title: n.title,
    body: n.body,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
