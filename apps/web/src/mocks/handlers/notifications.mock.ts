import type { NotificationResponse, NotificationType } from '@rental/shared';
import type { NotificationsApi } from '@/features/notifications/api';
import { ApiError } from '@/services/http/ApiError';
import { db } from '../db';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';

/**
 * Mock theo hình dạng backend: phân trang `{items,page,limit,total}`, `unreadOnly`, `readAt` quyết định đã đọc,
 * chỉ thấy thông báo của chính mình, đánh dấu đã đọc lặp lại là idempotent. Dữ liệu mẫu cũ (cờ `read`) chỉ được
 * dùng để dựng `readAt` một lần.
 */
const readAt = new Map<string, string | null>();
const typeOf = (title: string): NotificationType =>
  /bảo trì|sửa chữa/i.test(title) ? 'MAINTENANCE_STATUS_CHANGED' : /hóa đơn/i.test(title) ? 'INVOICE_ISSUED' : /xem phòng|lịch/i.test(title) ? 'VIEWING_CONFIRMED' : 'MAINTENANCE_CREATED';

function mine(userId: string): NotificationResponse[] {
  return db.notifications
    .filter((n) => n.userId === userId)
    .map((n) => {
      if (!readAt.has(n.id)) readAt.set(n.id, n.read ? n.createdAt : null);
      return {
        id: n.id,
        workspaceId: n.link?.match(/\/w\/([^/]+)/)?.[1] ?? 'ws-an-nhien',
        type: typeOf(n.title),
        entityType: 'MAINTENANCE_REQUEST',
        entityId: n.id,
        title: n.title,
        body: n.body || null,
        readAt: readAt.get(n.id) ?? null,
        createdAt: n.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const notificationsMock: NotificationsApi = {
  async list(q) {
    const { empty } = await simulate();
    const { user } = requireSession();
    const all = empty ? [] : mine(user.id).filter((n) => !q.unreadOnly || n.readAt === null);
    return { items: all.slice((q.page - 1) * q.limit, q.page * q.limit), page: q.page, limit: q.limit, total: all.length };
  },
  async unreadCount() {
    await simulate();
    const { user } = requireSession();
    return { unread: mine(user.id).filter((n) => n.readAt === null).length };
  },
  async markAllRead() {
    await simulate();
    const { user } = requireSession();
    const unread = mine(user.id).filter((n) => n.readAt === null);
    for (const n of unread) readAt.set(n.id, new Date().toISOString());
    return { updated: unread.length };
  },
  async markRead(id) {
    await simulate();
    const { user } = requireSession();
    const n = mine(user.id).find((x) => x.id === id);
    if (!n) throw new ApiError({ statusCode: 404, code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    if (n.readAt === null) readAt.set(id, new Date().toISOString());
    return { ...n, readAt: readAt.get(id) ?? null };
  },
};
