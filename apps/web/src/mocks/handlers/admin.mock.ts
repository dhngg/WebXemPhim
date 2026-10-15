import type {
  AdminAuditLogResponse,
  AdminListingResponse,
  AdminUserResponse,
  LandlordApplicationResponse,
  LandlordApplicationStatus,
} from '@rental/shared';
import type { AdminApi, AdminLandlordApplication } from '@/features/admin/api';
import { ApiError } from '@/services/http/ApiError';
import { mockRooms } from '../data/rooms';
import { mockUsers } from '../data/users';
import { nextId } from '../db';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';
import { mockLandlordApplications } from './landlord-application.mock';

/**
 * Mock theo ĐÚNG hình dạng và quy tắc của 11 endpoint `/admin/*`: chỉ Platform Admin; danh sách luôn là trang;
 * mỗi hành động ghi là một POST riêng với `{ reason }` bắt buộc (≤500 ký tự); khóa/ẩn lặp lại → 409 ADMIN_STATE_UNCHANGED;
 * không khóa chính mình hay Platform Admin khác; admin không duyệt đơn của chính mình; mọi hành động thành công ghi
 * audit (actor + targetType/targetId + lý do + metadata, không có email/IP). Chỉ dùng khi VITE_USE_MOCK_API=true.
 */
const DAY = 86_400_000;
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

function actor() {
  const { user } = requireSession();
  if (user.globalRole !== 'ADMIN') fail(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform admin required');
  return user;
}
function checkPage(q: { page: number; limit: number }) {
  if (!Number.isInteger(q.page) || q.page < 1 || !Number.isInteger(q.limit) || q.limit < 1 || q.limit > 100) {
    fail(400, 'VALIDATION_ERROR', 'page must be >= 1 and limit between 1 and 100');
  }
}
const pageOf = <T>(all: T[], q: { page: number; limit: number }) => ({ items: all.slice((q.page - 1) * q.limit, q.page * q.limit), page: q.page, limit: q.limit, total: all.length });
function checkReason(body: { reason?: unknown }): string {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > 500) fail(400, 'VALIDATION_ERROR', 'reason is required (max 500 characters)');
  return reason;
}

// ------------------------------------------------------------------------------------------------ nhật ký
const auditStore: AdminAuditLogResponse[] = [];
let lastStamp = 0;
/** Mốc thời gian tăng dần chặt, để hai thao tác liên tiếp luôn có thứ tự ổn định khi sắp theo thời gian. */
const stamp = () => new Date((lastStamp = Math.max(Date.now(), lastStamp + 1))).toISOString();
function record(actorUserId: string, action: string, targetType: string, targetId: string, reason: string, metadata: AdminAuditLogResponse['metadata'], createdAt = stamp()) {
  auditStore.push({ id: nextId('aud'), actorUserId, action, targetType, targetId, reason, metadata, createdAt });
}

// ------------------------------------------------------------------------------------------------ người dùng
interface StoredUser extends AdminUserResponse {
  workspaceMembershipCount: number;
}
const EXTRA_NAMES = ['Lê Thị Hồng', 'Phạm Minh Đức', 'Trần Thị Thu', 'Lê Văn Tài', 'Nguyễn Thanh Bình', 'Võ Thị Kim', 'Spam User', 'Đinh Quang Hải', 'Hà Thị Nga', 'Cù Văn Lực', 'Mạc Thùy Dung', 'Ông Văn Thịnh'];
const users: StoredUser[] = [
  ...mockUsers.map((u): StoredUser => ({
    id: u.user.id, email: u.user.email, displayName: u.user.fullName, status: 'ACTIVE', isPlatformAdmin: u.user.globalRole === 'ADMIN',
    disabledAt: null, createdAt: u.user.createdAt, workspaceMembershipCount: u.memberships.length,
  })),
  ...EXTRA_NAMES.map((name, i): StoredUser => ({
    id: `u-x${i}`, email: i === 6 ? 'spam.user@mail.vn' : `user${i + 1}@mail.vn`, displayName: name, status: i === 6 ? 'DISABLED' : 'ACTIVE', isPlatformAdmin: false,
    disabledAt: i === 6 ? iso(-2 * DAY) : null, createdAt: iso(-(i + 1) * 4 * DAY), workspaceMembershipCount: i < 2 ? 1 : 0,
  })),
];
const publicUser = (u: StoredUser): AdminUserResponse => ({
  id: u.id, email: u.email, displayName: u.displayName, status: u.status, isPlatformAdmin: u.isPlatformAdmin, disabledAt: u.disabledAt, createdAt: u.createdAt,
});
const findUser = (id: string) => users.find((u) => u.id === id) ?? fail(404, 'ADMIN_USER_NOT_FOUND', 'User not found');

// ------------------------------------------------------------------------------------------------ đơn chủ trọ
const seededApplications: Array<LandlordApplicationResponse & { userId: string }> = [];
const makeApp = (id: string, userId: string, status: LandlordApplicationStatus, reason: string, daysAgo: number, decisionNote: string | null = null): LandlordApplicationResponse & { userId: string } => ({
  id, userId, status, reason, decisionNote, decidedByUserId: status === 'PENDING' ? null : 'u-admin', decidedAt: status === 'PENDING' ? null : iso(-(daysAgo - 1) * DAY),
  createdAt: iso(-daysAgo * DAY), updatedAt: iso(-daysAgo * DAY),
});
seededApplications.push(
  makeApp('la-seed-1', 'u-x0', 'PENDING', 'Tôi đang sở hữu 12 phòng trọ ở Cầu Giấy và muốn quản lý bằng hệ thống.', 3),
  makeApp('la-seed-2', 'u-x2', 'PENDING', 'Nhà trọ gia đình 8 phòng ở Thủ Đức, cần quản lý điện nước.', 2),
  makeApp('la-seed-3', 'u-admin', 'PENDING', 'Đơn do chính tài khoản quản trị nộp.', 1),
  makeApp('la-seed-4', 'u-x1', 'APPROVED', 'Chung cư mini 15 phòng tại Hà Đông.', 20),
  makeApp('la-seed-5', 'u-x3', 'REJECTED', 'Muốn thử hệ thống.', 40, 'Thông tin chưa đủ để xác minh.'),
);
const userInfo = (userId: string) => {
  const u = users.find((x) => x.id === userId);
  return { id: userId, email: u?.email ?? `${userId}@unknown`, displayName: u?.displayName ?? null };
};
/** Đơn mẫu + đơn do người dùng demo tự nộp (cùng một đối tượng với `capabilities.landlordApplication`, nên duyệt ở đây đổi quyền thật). */
function allApplications(): Array<{ app: LandlordApplicationResponse; userId: string }> {
  const fromUsers = [...mockLandlordApplications.entries()].filter(([, a]) => !seededApplications.some((s) => s.id === a.id)).map(([userId, app]) => ({ app, userId }));
  return [...seededApplications.map((app) => ({ app: app as LandlordApplicationResponse, userId: app.userId })), ...fromUsers];
}
const viewApp = (e: { app: LandlordApplicationResponse; userId: string }): AdminLandlordApplication => {
  const { userId, ...rest } = e.app as LandlordApplicationResponse & { userId?: string };
  void userId;
  return { ...rest, user: userInfo(e.userId) };
};

function decide(status: Exclude<LandlordApplicationStatus, 'PENDING'>, id: string, reason: string, adminId: string): LandlordApplicationResponse {
  const entry = allApplications().find((e) => e.app.id === id) ?? fail(404, 'LANDLORD_APPLICATION_NOT_FOUND', 'Landlord application not found');
  if (entry.userId === adminId || entry.app.status !== 'PENDING') fail(409, 'LANDLORD_APPLICATION_INVALID_TRANSITION', 'Landlord application cannot be decided in its current state');
  const now = iso();
  Object.assign(entry.app, { status, decisionNote: reason, decidedByUserId: adminId, decidedAt: now, updatedAt: now });
  record(adminId, status === 'APPROVED' ? 'LANDLORD_APPLICATION_APPROVED' : 'LANDLORD_APPLICATION_REJECTED', 'LANDLORD_APPLICATION', id, reason, { applicantUserId: entry.userId, applicationStatus: status });
  const { userId, ...rest } = entry.app as LandlordApplicationResponse & { userId?: string };
  void userId;
  return rest;
}

// ------------------------------------------------------------------------------------------------ tin đăng
interface StoredListing extends AdminListingResponse {
  updatedOrder: number;
}
let orderClock = 0;
const listings: StoredListing[] = mockRooms.map((r, i) => ({
  id: r.id, workspaceId: i % 2 === 0 ? 'ws-an-nhien' : 'ws-sunhouse', roomId: `room-${r.id}`, roomCode: `P.${101 + i}`, buildingName: r.buildingName, city: r.city,
  monthlyRent: `${r.price}.00`, isPublished: i % 7 !== 6, isHidden: false, moderationReason: null, moderatedAt: null, updatedOrder: ++orderClock,
}));
const publicListing = (l: StoredListing): AdminListingResponse => {
  const { updatedOrder, ...rest } = l;
  void updatedOrder;
  return rest;
};
const findListing = (id: string) => listings.find((l) => l.id === id) ?? fail(404, 'LISTING_NOT_FOUND', 'Listing not found');
/** Tin bị ẩn: marketplace mock phải ẩn khỏi trang công khai (id công khai của tin = id ở đây). */
export function isListingRemoved(listingId: string) {
  return listings.some((l) => l.id === listingId && l.isHidden);
}

// khởi tạo nhật ký mẫu sau khi có người dùng/tin
record('u-admin', 'USER_LOCK', 'USER', 'u-x6', 'Tài khoản spam, đăng tin rác.', { previousStatus: 'ACTIVE', newStatus: 'DISABLED', revokedSessions: 2 }, iso(-2 * DAY));
record('u-admin', 'LANDLORD_APPLICATION_APPROVED', 'LANDLORD_APPLICATION', 'la-seed-4', 'Đã xác minh giấy tờ.', { applicantUserId: 'u-x1', applicationStatus: 'APPROVED' }, iso(-19 * DAY));
record('u-admin', 'LANDLORD_APPLICATION_REJECTED', 'LANDLORD_APPLICATION', 'la-seed-5', 'Thông tin chưa đủ để xác minh.', { applicantUserId: 'u-x3', applicationStatus: 'REJECTED' }, iso(-39 * DAY));
record('u-admin', 'LISTING_HIDE', 'LISTING', 'r-7', 'Ảnh không đúng thực tế.', { workspaceId: 'ws-an-nhien', roomId: 'room-r-7' }, iso(-5 * DAY));
record('u-admin', 'LISTING_RESTORE', 'LISTING', 'r-7', 'Chủ trọ đã cập nhật ảnh.', { workspaceId: 'ws-an-nhien', roomId: 'room-r-7' }, iso(-4 * DAY));

const lastModeration = (userId: string) =>
  [...auditStore].filter((a) => a.targetType === 'USER' && a.targetId === userId && (a.action === 'USER_LOCK' || a.action === 'USER_UNLOCK')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.reason ?? null;

function setLock(adminId: string, id: string, lock: boolean, body: { reason?: unknown }) {
  const reason = checkReason(body);
  const target = findUser(id);
  if (id === adminId || (lock && target.isPlatformAdmin)) fail(409, 'ADMIN_TARGET_PROTECTED', 'This account cannot be locked through the admin API');
  const next = lock ? 'DISABLED' : 'ACTIVE';
  if (target.status === next) fail(409, 'ADMIN_STATE_UNCHANGED', 'Nothing to change');
  const previous = target.status;
  target.status = next;
  target.disabledAt = lock ? iso() : null;
  record(adminId, lock ? 'USER_LOCK' : 'USER_UNLOCK', 'USER', id, reason, { previousStatus: previous, newStatus: next, revokedSessions: lock ? 1 : 0 });
  return publicUser(target);
}
function setHidden(adminId: string, id: string, hidden: boolean, body: { reason?: unknown }) {
  const reason = checkReason(body);
  const l = findListing(id);
  if (l.isHidden === hidden) fail(409, 'ADMIN_STATE_UNCHANGED', 'Nothing to change');
  l.isHidden = hidden;
  l.moderationReason = reason;
  l.moderatedAt = iso();
  l.updatedOrder = ++orderClock;
  record(adminId, hidden ? 'LISTING_HIDE' : 'LISTING_RESTORE', 'LISTING', id, reason, { workspaceId: l.workspaceId, roomId: l.roomId });
  return publicListing(l);
}

export const adminMock: AdminApi = {
  async applications(q) {
    const { empty } = await simulate();
    actor();
    checkPage(q);
    if (q.status && !['PENDING', 'APPROVED', 'REJECTED'].includes(q.status)) fail(400, 'VALIDATION_ERROR', 'status is invalid');
    if (empty) return pageOf([], q);
    const all = allApplications()
      .filter((e) => !q.status || e.app.status === q.status)
      .sort((a, b) => a.app.createdAt.localeCompare(b.app.createdAt) || a.app.id.localeCompare(b.app.id));
    return pageOf(all.map(viewApp), q);
  },
  async approveApplication(id, body) {
    await simulate();
    const admin = actor();
    return decide('APPROVED', id, checkReason(body), admin.id);
  },
  async rejectApplication(id, body) {
    await simulate();
    const admin = actor();
    return decide('REJECTED', id, checkReason(body), admin.id);
  },

  async users(q) {
    const { empty } = await simulate();
    actor();
    checkPage(q);
    if (q.status && q.status !== 'ACTIVE' && q.status !== 'DISABLED') fail(400, 'VALIDATION_ERROR', 'status is invalid');
    if (empty) return pageOf([], q);
    const search = q.search?.trim().toLowerCase();
    const all = users
      .filter((u) => (!q.status || u.status === q.status) && (!search || u.email.toLowerCase().includes(search)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return pageOf(all.map(publicUser), q);
  },
  async user(id) {
    await simulate();
    actor();
    const u = findUser(id);
    return { ...publicUser(u), workspaceMembershipCount: u.workspaceMembershipCount, activeSessionCount: u.status === 'ACTIVE' ? 1 : 0, lastModerationReason: lastModeration(id) };
  },
  async lockUser(id, body) {
    await simulate();
    return setLock(actor().id, id, true, body);
  },
  async unlockUser(id, body) {
    await simulate();
    return setLock(actor().id, id, false, body);
  },

  async listings(q) {
    const { empty } = await simulate();
    actor();
    checkPage(q);
    if (empty) return pageOf([], q);
    const all = listings
      .filter((l) => (q.hidden === undefined || l.isHidden === q.hidden) && (q.published === undefined || l.isPublished === q.published) && (!q.workspaceId || l.workspaceId === q.workspaceId))
      .sort((a, b) => b.updatedOrder - a.updatedOrder);
    return pageOf(all.map(publicListing), q);
  },
  async hideListing(id, body) {
    await simulate();
    return setHidden(actor().id, id, true, body);
  },
  async restoreListing(id, body) {
    await simulate();
    return setHidden(actor().id, id, false, body);
  },

  async auditLogs(q) {
    const { empty } = await simulate();
    actor();
    checkPage(q);
    if (q.targetType && q.targetType !== 'USER' && q.targetType !== 'LISTING') fail(400, 'VALIDATION_ERROR', 'targetType must be USER or LISTING');
    if (empty) return pageOf([], q);
    const from = q.from ? Date.parse(q.from) : undefined;
    const to = q.to ? Date.parse(q.to) : undefined;
    const all = auditStore
      .filter(
        (a) =>
          (!q.actorUserId || a.actorUserId === q.actorUserId) &&
          (!q.action || a.action === q.action) &&
          (!q.targetType || a.targetType === q.targetType) &&
          (!q.targetId || a.targetId === q.targetId) &&
          (from === undefined || Date.parse(a.createdAt) >= from) &&
          (to === undefined || Date.parse(a.createdAt) < to),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    return pageOf(all, q);
  },
};
