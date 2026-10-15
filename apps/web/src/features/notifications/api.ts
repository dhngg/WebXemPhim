import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MarkAllReadResponse, NotificationPageResponse, NotificationResponse, UnreadCountResponse } from '@rental/shared';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { notificationsMock } from '@/mocks/handlers/notifications.mock';

export interface NotificationQuery {
  unreadOnly?: boolean;
  page: number;
  limit: number;
}

/**
 * 4 endpoint thông báo của CHÍNH người đang đăng nhập (dùng chung chủ trọ / người thuê / người tìm phòng).
 * Dùng thẳng DTO dùng chung; `readAt` là nguồn duy nhất xác định đã đọc. Không có push/email/realtime.
 */
export interface NotificationsApi {
  list(query: NotificationQuery): Promise<NotificationPageResponse>;
  unreadCount(): Promise<UnreadCountResponse>;
  markAllRead(): Promise<MarkAllReadResponse>;
  markRead(id: string): Promise<NotificationResponse>;
}

export const notificationsHttp: NotificationsApi = {
  list: (q) => httpClient.get('/notifications', { query: { unreadOnly: q.unreadOnly ? 'true' : undefined, page: q.page, limit: q.limit } }),
  unreadCount: () => httpClient.get('/notifications/unread-count'),
  markAllRead: () => httpClient.post('/notifications/read-all'),
  markRead: (id) => httpClient.post(`/notifications/${encodeURIComponent(id)}/read`),
};

export const notificationsApi: NotificationsApi = env.useMockApi ? notificationsMock : notificationsHttp;

const KEY = ['notifications'] as const;

export function useNotificationPage(query: NotificationQuery, enabled = true) {
  return useQuery({ queryKey: [...KEY, 'list', query], queryFn: () => notificationsApi.list(query), enabled, placeholderData: keepPreviousData });
}
/** Số chưa đọc thật cho huy hiệu ở menu; làm mới khi quay lại tab và sau mỗi lần đánh dấu đã đọc. */
export function useUnreadCount(enabled = true) {
  return useQuery({ queryKey: [...KEY, 'unread'], queryFn: () => notificationsApi.unreadCount(), enabled, refetchOnWindowFocus: true });
}
export function useMarkNotification() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    markRead: useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), onSuccess }),
    markAllRead: useMutation({ mutationFn: () => notificationsApi.markAllRead(), onSuccess }),
  };
}
