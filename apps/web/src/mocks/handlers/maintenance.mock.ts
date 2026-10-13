import type { MaintenanceApi } from '@/features/maintenance/api';
import type { MaintenanceRequest } from '@/features/maintenance/types';
import { db, nextId } from '../db';
import { conflict, includesText, requireMember, validation } from '../guard';
import { notFound, simulate } from '../mockUtils';

const find = (ws: string, id: string) =>
  db.maintenance.find((m) => m.workspaceId === ws && m.id === id) ?? notFound('Không tìm thấy yêu cầu bảo trì.');

const NEXT: Record<string, string[]> = { OPEN: ['IN_PROGRESS', 'RESOLVED'], IN_PROGRESS: ['RESOLVED', 'OPEN'], RESOLVED: ['IN_PROGRESS'] };

export const maintenanceMock: MaintenanceApi = {
  async list(ws, f) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    const order = { URGENT: 0, MEDIUM: 1, LOW: 2 };
    return db.maintenance
      .filter(
        (m) =>
          m.workspaceId === ws &&
          (!f.status || m.status === f.status) &&
          (!f.priority || m.priority === f.priority) &&
          includesText(`${m.title} ${m.roomCode} ${m.tenantName ?? ''}`, f.q),
      )
      .sort((a, b) => Number(a.status === 'RESOLVED') - Number(b.status === 'RESOLVED') || order[a.priority] - order[b.priority] || b.createdAt.localeCompare(a.createdAt));
  },
  async get(ws, id) {
    await simulate();
    requireMember(ws);
    return find(ws, id);
  },
  async create(ws, input) {
    await simulate();
    const { user } = requireMember(ws);
    const room = db.rooms.find((r) => r.workspaceId === ws && r.id === input.roomId) ?? notFound('Phòng không tồn tại.');
    const now = new Date().toISOString();
    const m: MaintenanceRequest = {
      ...input,
      id: nextId('mnt'),
      workspaceId: ws,
      roomCode: room.code,
      buildingName: room.buildingName,
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
      comments: [{ id: nextId('cmt'), author: user.fullName, role: 'STAFF', text: input.description, at: now }],
    };
    db.maintenance.unshift(m);
    return m;
  },
  async update(ws, id, patch) {
    await simulate();
    const { user } = requireMember(ws);
    const m = find(ws, id);
    if (patch.status && patch.status !== m.status) {
      if (!NEXT[m.status]?.includes(patch.status)) conflict('Không thể chuyển sang trạng thái này.');
      m.comments.push({ id: nextId('cmt'), author: user.fullName, role: 'STAFF', text: `Cập nhật trạng thái → ${patch.status}`, at: new Date().toISOString() });
      m.status = patch.status;
    }
    if (patch.assignee !== undefined) m.assignee = patch.assignee || undefined;
    m.updatedAt = new Date().toISOString();
    return m;
  },
  async comment(ws, id, text) {
    await simulate();
    const { user } = requireMember(ws);
    if (!text.trim()) validation('Nội dung trống.', { text: 'Nhập nội dung trao đổi' });
    const m = find(ws, id);
    m.comments.push({ id: nextId('cmt'), author: user.fullName, role: 'STAFF', text: text.trim(), at: new Date().toISOString() });
    m.updatedAt = new Date().toISOString();
    return m;
  },
};
