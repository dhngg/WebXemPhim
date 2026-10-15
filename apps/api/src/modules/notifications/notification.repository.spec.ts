import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NotificationNotFoundRepositoryError,
  NotificationRepository,
} from './notification.repository';
import { NotificationService, toResponse } from './notification.service';

const row = {
  id: 'n1',
  userId: 'u1',
  workspaceId: 'w',
  type: 'INVOICE_ISSUED',
  entityType: 'INVOICE',
  entityId: 'i1',
  title: 'New invoice issued',
  body: null,
  dedupeKey: 'invoice:i1:ISSUED',
  readAt: null,
  createdAt: new Date('2026-10-14T00:00:00Z'),
};

function repo(overrides: Record<string, unknown> = {}) {
  const notification = {
    findMany: jest.fn().mockResolvedValue([row]),
    count: jest.fn().mockResolvedValue(1),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findFirst: jest.fn().mockResolvedValue(row),
    ...overrides,
  };
  const prisma = {
    notification,
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { notification, repository: new NotificationRepository(prisma as never) };
}

describe('NotificationRepository', () => {
  it('always filters by the caller user id', async () => {
    const { notification, repository } = repo();
    await repository.list('u1', { unreadOnly: true, page: 2, limit: 10 });
    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', readAt: null }, skip: 10, take: 10 }),
    );
    await repository.countUnread('u1');
    expect(notification.count).toHaveBeenLastCalledWith({ where: { userId: 'u1', readAt: null } });
  });

  it('marks read only for the owner and only if unread', async () => {
    const { notification, repository } = repo();
    await repository.markRead('u1', 'n1');
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'n1', userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("does not reveal another user's notification", async () => {
    const { repository } = repo({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(repository.markRead('other', 'n1')).rejects.toBeInstanceOf(
      NotificationNotFoundRepositoryError,
    );
  });

  it('mark-all is scoped to the caller', async () => {
    const { notification, repository } = repo();
    await expect(repository.markAllRead('u1')).resolves.toBe(1);
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe('NotificationService', () => {
  it('maps rows without leaking user id or dedupe key', () => {
    const response = toResponse(row as never);
    expect(response).not.toHaveProperty('userId');
    expect(response).not.toHaveProperty('dedupeKey');
    expect(response.readAt).toBeNull();
  });

  it('maps a missing notification to NOTIFICATION_NOT_FOUND', async () => {
    const { repository } = repo({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(new NotificationService(repository).markRead('u', 'n')).rejects.toMatchObject({
      code: 'NOTIFICATION_NOT_FOUND',
    });
  });
});

describe('notification migration', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../prisma/migrations/202610140020_p10_notifications/migration.sql'),
    'utf8',
  );
  it('is additive only and keeps notifications append-only', () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
    expect(sql).toContain('notifications cannot be hard-deleted');
    expect(sql).toContain('"notifications_user_dedupe_key"');
  });
});
