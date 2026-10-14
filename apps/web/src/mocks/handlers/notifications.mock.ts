import type { NotificationsApi } from '@/features/notifications/api';
import { db } from '../db';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';

export const notificationsMock: NotificationsApi = {
  async list() {
    const { empty } = await simulate();
    const { user } = requireSession();
    if (empty) return [];
    return db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async markRead(id) {
    await simulate();
    const { user } = requireSession();
    const n = db.notifications.find((x) => x.id === id && x.userId === user.id);
    if (n) n.read = true;
  },
  async markAllRead() {
    await simulate();
    const { user } = requireSession();
    db.notifications.filter((n) => n.userId === user.id).forEach((n) => (n.read = true));
  },
};
