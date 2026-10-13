import type { AdminApi } from '@/features/admin/api';
import type { AdminListing, AdminUser, AdminWorkspace } from '@/features/admin/types';
import { addDays } from '@/lib/dates';
import { audit, db, TODAY } from '../db';
import { mockRooms } from '../data/rooms';
import { mockUsers } from '../data/users';
import { conflict, includesText, requireAdmin } from '../guard';
import { notFound, simulate } from '../mockUtils';

const EXTRA_NAMES = ['Lê Thị Hồng', 'Phạm Minh Đức', 'Trần Thị Thu', 'Lê Văn Tài', 'Nguyễn Thanh Bình', 'Võ Thị Kim', 'Spam User', 'Đinh Quang Hải', 'Hà Thị Nga', 'Cù Văn Lực', 'Mạc Thùy Dung', 'Ông Văn Thịnh'];

const users: AdminUser[] = [
  ...mockUsers.map((u) => ({
    id: u.user.id,
    fullName: u.user.fullName,
    email: u.user.email,
    phone: u.user.phone,
    globalRole: u.user.globalRole,
    status: 'ACTIVE' as const,
    workspaceCount: u.memberships.length,
    createdAt: u.user.createdAt,
    lastActiveAt: new Date().toISOString(),
  })),
  ...EXTRA_NAMES.map((name, i) => ({
    id: `u-x${i}`,
    fullName: name,
    email: i === 6 ? 'spam.user@mail.vn' : `user${i + 1}@mail.vn`,
    phone: `09${String(30_000_000 + i * 1_234_567).slice(0, 8)}`,
    globalRole: 'USER' as const,
    status: i === 6 ? ('LOCKED' as const) : ('ACTIVE' as const),
    workspaceCount: i < 2 ? 1 : 0,
    createdAt: new Date(Date.now() - (i + 1) * 4 * 86_400_000).toISOString(),
    lastActiveAt: new Date(Date.now() - i * 86_400_000).toISOString(),
  })),
];

const workspaces: AdminWorkspace[] = [
  { id: 'ws-an-nhien', name: 'Nhà Trọ An Nhiên Group', ownerName: 'Nguyễn Văn Quân', status: 'ACTIVE', buildingCount: 3, roomCount: 28, plan: 'Chuyên Nghiệp', createdAt: '2022-03-01T02:00:00.000Z' },
  { id: 'ws-sunhouse', name: 'SunHouse Bình Thạnh', ownerName: 'Lê Thị Hồng', status: 'ACTIVE', buildingCount: 1, roomCount: 12, plan: 'Cơ Bản', createdAt: '2024-01-01T02:00:00.000Z' },
  { id: 'ws-d2', name: 'D2 Residence', ownerName: 'Phạm Minh Đức', status: 'ACTIVE', buildingCount: 2, roomCount: 18, plan: 'Cơ Bản', createdAt: '2024-06-10T02:00:00.000Z' },
  { id: 'ws-gv', name: 'Nhà trọ Gò Vấp Xanh', ownerName: 'Nguyễn Thanh Bình', status: 'SUSPENDED', buildingCount: 1, roomCount: 9, plan: 'Miễn phí', createdAt: '2025-02-14T02:00:00.000Z' },
];

if (db.adminListings.length === 0) {
  db.adminListings.push(
    ...mockRooms.map<AdminListing>((r, i) => ({
      id: `lst-${r.id}`,
      roomId: r.id,
      title: r.title,
      workspaceName: r.buildingName,
      price: r.price,
      status: i === 6 || i === 12 ? 'REPORTED' : 'ACTIVE',
      reportCount: i === 6 ? 3 : i === 12 ? 1 : 0,
      reportReason: i === 6 ? 'Ảnh không đúng thực tế, giá ảo' : i === 12 ? 'Chủ trọ không liên lạc được' : undefined,
      postedAt: r.postedAt,
    })),
  );
}

/** Tin bị gỡ — marketplace mock sẽ ẩn. */
export function isListingRemoved(roomId: string) {
  return db.adminListings.some((l) => l.roomId === roomId && l.status === 'REMOVED');
}

export const adminMock: AdminApi = {
  async overview() {
    await simulate();
    requireAdmin();
    return {
      users: users.length,
      workspaces: workspaces.length,
      activeListings: db.adminListings.filter((l) => l.status !== 'REMOVED').length,
      reportedListings: db.adminListings.filter((l) => l.status === 'REPORTED').length,
      newUsers7d: users.filter((u) => u.createdAt > new Date(Date.now() - 7 * 86_400_000).toISOString()).length,
      signupsByDay: Array.from({ length: 14 }, (_, i) => ({ date: addDays(TODAY, i - 13), count: [2, 4, 3, 5, 1, 6, 4, 3, 7, 5, 4, 8, 6, 5][i]! })),
    };
  },
  async users(q) {
    const { empty } = await simulate();
    requireAdmin();
    return empty ? [] : users.filter((u) => includesText(`${u.fullName} ${u.email} ${u.phone}`, q));
  },
  async setUserLocked(id, locked) {
    await simulate();
    const admin = requireAdmin();
    const u = users.find((x) => x.id === id) ?? notFound('Không tìm thấy người dùng.');
    if (u.globalRole === 'ADMIN') conflict('Không thể khóa tài khoản quản trị.');
    u.status = locked ? 'LOCKED' : 'ACTIVE';
    audit(admin.email, locked ? 'Khóa tài khoản' : 'Mở khóa tài khoản', u.email, 'USER');
    return u;
  },
  async workspaces(q) {
    const { empty } = await simulate();
    requireAdmin();
    return empty ? [] : workspaces.filter((w) => includesText(`${w.name} ${w.ownerName}`, q));
  },
  async setWorkspaceStatus(id, status) {
    await simulate();
    const admin = requireAdmin();
    const w = workspaces.find((x) => x.id === id) ?? notFound('Không tìm thấy workspace.');
    w.status = status;
    const s = db.settings[id];
    if (s) s.status = status;
    mockUsers.forEach((u) => u.memberships.filter((m) => m.workspaceId === id).forEach((m) => (m.status = status)));
    audit(admin.email, status === 'SUSPENDED' ? 'Tạm khóa workspace' : 'Kích hoạt workspace', w.name, 'WORKSPACE');
    return w;
  },
  async listings(status) {
    const { empty } = await simulate();
    requireAdmin();
    if (empty) return [];
    return db.adminListings
      .filter((l) => !status || l.status === status)
      .sort((a, b) => b.reportCount - a.reportCount || b.postedAt.localeCompare(a.postedAt));
  },
  async setListingStatus(id, status) {
    await simulate();
    const admin = requireAdmin();
    const l = db.adminListings.find((x) => x.id === id) ?? notFound('Không tìm thấy tin đăng.');
    l.status = status;
    if (status === 'ACTIVE') l.reportCount = 0;
    audit(admin.email, status === 'REMOVED' ? 'Gỡ tin đăng vi phạm' : 'Khôi phục tin đăng', l.title, 'LISTING');
    return l;
  },
  async auditLogs(f) {
    const { empty } = await simulate();
    requireAdmin();
    if (empty) return [];
    return db.auditLogs.filter(
      (l) =>
        (!f.category || l.category === f.category) &&
        (!f.from || l.at.slice(0, 10) >= f.from) &&
        (!f.to || l.at.slice(0, 10) <= f.to) &&
        includesText(`${l.actor} ${l.action} ${l.target}`, f.q),
    );
  },
};
