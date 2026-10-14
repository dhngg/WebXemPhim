import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { httpClient } from '@/services/http/httpClient';
import { notificationsMock } from '@/mocks/handlers/notifications.mock';
import type { AppNotification } from './types';

export interface NotificationsApi {
  list(): Promise<AppNotification[]>;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

/** Thông báo trong ứng dụng — chưa có kênh push/email/Zalo thật. */
const notificationsHttp: NotificationsApi = {
  list: () => httpClient.get('/notifications'),
  markRead: (id) => httpClient.post(`/notifications/${id}/read`),
  markAllRead: () => httpClient.post('/notifications/read-all'),
};

export const notificationsApi: NotificationsApi = env.useMockApi ? notificationsMock : notificationsHttp;

const KEY = ['notifications'] as const;

export function useNotifications(enabled = true) {
  return useQuery({ queryKey: KEY, queryFn: () => notificationsApi.list(), enabled });
}
export function useMarkNotification() {
  const qc = useQueryClient();
  const onSuccess = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    markRead: useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), onSuccess }),
    markAllRead: useMutation({ mutationFn: () => notificationsApi.markAllRead(), onSuccess }),
  };
}
