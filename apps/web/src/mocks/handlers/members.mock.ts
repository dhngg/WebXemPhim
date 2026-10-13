import type { MembersApi } from '@/features/members/api';
import type { Member } from '@/features/members/types';
import { audit, db, nextId } from '../db';
import { mockUsers } from '../data/users';
import { conflict, requireMember } from '../guard';
import { notFound, simulate } from '../mockUtils';

const find = (ws: string, id: string) => db.members.find((m) => m.workspaceId === ws && m.id === id) ?? notFound('Không tìm thấy thành viên.');

function guardNotOwner(m: Member) {
  if (m.role === 'OWNER') conflict('Không thể thay đổi chủ sở hữu workspace.');
}

export const membersMock: MembersApi = {
  async list(ws) {
    await simulate();
    requireMember(ws);
    return db.members.filter((m) => m.workspaceId === ws);
  },
  async invite(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'members.manage');
    const email = input.email.trim().toLowerCase();
    if (db.members.some((m) => m.workspaceId === ws && m.email === email)) conflict('Email này đã là thành viên.');
    const existing = mockUsers.find((u) => u.user.email === email);
    const m: Member = {
      id: nextId('mem'),
      workspaceId: ws,
      userId: existing?.user.id ?? nextId('u'),
      fullName: existing?.user.fullName ?? email.split('@')[0]!,
      email,
      role: input.role,
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
    };
    db.members.push(m);
    audit(user.email, `Thêm thành viên (${input.role})`, email, 'WORKSPACE');
    return m;
  },
  async updateRole(ws, id, role) {
    await simulate();
    requireMember(ws, 'members.manage');
    const m = find(ws, id);
    guardNotOwner(m);
    m.role = role;
    return m;
  },
  async setLocked(ws, id, locked) {
    await simulate();
    requireMember(ws, 'members.manage');
    const m = find(ws, id);
    guardNotOwner(m);
    m.status = locked ? 'LOCKED' : 'ACTIVE';
    return m;
  },
  async remove(ws, id) {
    await simulate();
    const { user } = requireMember(ws, 'members.manage');
    const m = find(ws, id);
    guardNotOwner(m);
    db.members.splice(db.members.indexOf(m), 1);
    audit(user.email, 'Xóa thành viên', m.email, 'WORKSPACE');
  },
  async getSettings(ws) {
    await simulate();
    requireMember(ws);
    return db.settings[ws] ?? notFound('Không tìm thấy workspace.');
  },
  async updateSettings(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'workspace.settings');
    const s = db.settings[ws] ?? notFound('Không tìm thấy workspace.');
    Object.assign(s, input);
    // đồng bộ tên trong membership của mock user
    mockUsers.forEach((u) => u.memberships.filter((m) => m.workspaceId === ws).forEach((m) => (m.name = s.name)));
    audit(user.email, 'Cập nhật cài đặt workspace', s.name, 'WORKSPACE');
    return s;
  },
};
