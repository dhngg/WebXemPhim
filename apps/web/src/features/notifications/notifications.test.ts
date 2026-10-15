import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_TYPES, type NotificationResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { db } from '@/mocks/db';
import { ApiError } from '@/services/http/ApiError';
import { notificationsMock } from '@/mocks/handlers/notifications.mock';
import { notificationsHttp } from './api';
import apiSource from './api.ts?raw';
import menuSource from '../../layouts/parts/UserMenu.tsx?raw';
import pageSource from '../../pages/user/UserPages.tsx?raw';
import { NOTIFICATION_TYPE } from './labels';

const N = '88888888-8888-4888-8888-888888888888';
const note = (o: Partial<NotificationResponse> = {}): NotificationResponse => ({
  id: N, workspaceId: 'w', type: 'MAINTENANCE_CREATED', entityType: 'MaintenanceRequest', entityId: 'e', title: 'T', body: null, readAt: null, createdAt: '2026-10-10T00:00:00.000Z', ...o,
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('HTTP adapter: the 4 shared notification endpoints', () => {
  it('list sends unreadOnly/page/limit; unread-count; read-all; read one', async () => {
    http.get.mockResolvedValue({ items: [], page: 2, limit: 20, total: 0 });
    await notificationsHttp.list({ unreadOnly: true, page: 2, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/notifications', { query: { unreadOnly: 'true', page: 2, limit: 20 } });
    await notificationsHttp.list({ page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/notifications', { query: { unreadOnly: undefined, page: 1, limit: 20 } });
    http.get.mockResolvedValue({ unread: 3 });
    expect(await notificationsHttp.unreadCount()).toEqual({ unread: 3 });
    expect(http.get).toHaveBeenLastCalledWith('/notifications/unread-count');
    http.post.mockResolvedValue({ updated: 3 });
    expect(await notificationsHttp.markAllRead()).toEqual({ updated: 3 });
    expect(http.post).toHaveBeenLastCalledWith('/notifications/read-all');
    http.post.mockResolvedValue(note({ readAt: '2026-10-11T00:00:00.000Z' }));
    expect((await notificationsHttp.markRead(N)).readAt).toBeTruthy();
    expect(http.post).toHaveBeenLastCalledWith(`/notifications/${N}/read`);
  });
  it('uses the shared DTOs, readAt (not a legacy read flag) and builds no deep link from entityId', () => {
    expect(apiSource).toMatch(/@rental\/shared/);
    for (const [name, text] of Object.entries({ api: apiSource, page: pageSource.slice(pageSource.indexOf('export function NotificationsPage'), pageSource.indexOf('export function WorkspaceSelectPage')) })) {
      expect(text, name).not.toMatch(/\.read\b|n\.link|entityId|navigate\(/);
    }
    expect(Object.keys(NOTIFICATION_TYPE)).toEqual([...NOTIFICATION_TYPES]);
  });
  it('the menu badge shows the backend unread count', () => {
    expect(menuSource).toMatch(/useUnreadCount/);
    expect(menuSource).toMatch(/unread-badge/);
  });
});

describe('mock follows the backend (own notifications, readAt, pagination)', () => {
  const as = (id: string) => {
    session.record = { user: { id, fullName: 'U', email: 'u@x.vn' }, memberships: [] };
  };
  const owner = () => db.notifications.find((n) => n.userId === 'u-owner')!.userId;

  it('lists only my notifications as a page, newest first, and filters unreadOnly', async () => {
    as(owner());
    const page = await notificationsMock.list({ page: 1, limit: 20 });
    expect(page).toMatchObject({ page: 1, limit: 20 });
    expect(page.total).toBe(db.notifications.filter((n) => n.userId === owner()).length);
    expect(page.items.every((n) => 'readAt' in n && !('read' in n) && !('link' in n))).toBe(true);
    expect(page.items.map((n) => n.createdAt)).toEqual([...page.items.map((n) => n.createdAt)].sort().reverse());
    const unread = await notificationsMock.list({ unreadOnly: true, page: 1, limit: 20 });
    expect(unread.items.every((n) => n.readAt === null)).toBe(true);
    expect(unread.total).toBe((await notificationsMock.unreadCount()).unread);
    expect((await notificationsMock.list({ page: 1, limit: 1 })).items).toHaveLength(1);
    as('someone-else');
    expect((await notificationsMock.list({ page: 1, limit: 20 })).total).toBe(0);
    expect(await notificationsMock.unreadCount()).toEqual({ unread: 0 });
  });

  it('mark one is idempotent, lowers the count, and cannot touch another user; read-all returns how many changed', async () => {
    as(owner());
    const before = (await notificationsMock.unreadCount()).unread;
    expect(before).toBeGreaterThan(1);
    const target = (await notificationsMock.list({ unreadOnly: true, page: 1, limit: 20 })).items[0]!;
    const read = await notificationsMock.markRead(target.id);
    expect(read.readAt).toBeTruthy();
    expect((await notificationsMock.unreadCount()).unread).toBe(before - 1);
    expect((await notificationsMock.markRead(target.id)).readAt).toBe(read.readAt); // retry keeps the original time
    expect((await notificationsMock.unreadCount()).unread).toBe(before - 1);
    as('someone-else');
    await expect(notificationsMock.markRead(target.id)).rejects.toMatchObject({ code: 'NOTIFICATION_NOT_FOUND' });
    as(owner());
    expect(await notificationsMock.markAllRead()).toEqual({ updated: before - 1 });
    expect(await notificationsMock.unreadCount()).toEqual({ unread: 0 });
    expect(await notificationsMock.markAllRead()).toEqual({ updated: 0 });
    expect((await notificationsMock.list({ unreadOnly: true, page: 1, limit: 20 })).items).toEqual([]);
    expect(new ApiError({ statusCode: 404, message: 'x' })).toBeInstanceOf(ApiError);
  });
});
