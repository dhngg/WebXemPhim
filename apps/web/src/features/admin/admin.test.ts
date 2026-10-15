import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const ctl = vi.hoisted(() => ({ record: null as unknown, empty: false }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: ctl.empty }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => ctl.record, currentMockUser: () => null }));

import { areasOf } from '@/features/capabilities/model';
import { ApiError } from '@/services/http/ApiError';
import { adminMock, isListingRemoved } from '@/mocks/handlers/admin.mock';
import { capabilitiesMock } from '@/mocks/handlers/capabilities.mock';
import { mockLandlordApplications } from '@/mocks/handlers/landlord-application.mock';
import { adminHttp } from './api';
import { APPLICATION_STATUS, AUDIT_ACTION, adminErrorMessage, auditActionLabel, auditRange, canDecide, isFilterableTarget, isOwnApplication, reasonSchema, toReasonBody } from './model';
import apiSource from './api.ts?raw';
import hooksSource from './hooks.ts?raw';
import modelSource from './model.ts?raw';
import dashSource from '../../pages/admin/AdminPages.tsx?raw';
import userPagesSource from '../../pages/admin/AdminUserPages.tsx?raw';
import partsSource from '../../pages/admin/parts.tsx?raw';
import layoutSource from '../../layouts/AdminLayout.tsx?raw';
import routerSource from '../../app/router.tsx?raw';
import mockSource from '../../mocks/handlers/admin.mock.ts?raw';

const ID = '99999999-9999-4999-8999-999999999999';
const H = adminHttp;
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
  ctl.empty = false;
});

// ===================================================================== 11 endpoint đúng method / URL / query / body
describe('HTTP adapter: 11 endpoint Platform Admin', () => {
  it('Landlord applications: danh sách có status/page/limit; duyệt/từ chối là POST với { reason }', async () => {
    http.get.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    await H.applications({ status: 'PENDING', page: 2, limit: 10 });
    expect(http.get).toHaveBeenLastCalledWith('/admin/landlord-applications', { query: { status: 'PENDING', page: 2, limit: 10 } });
    await H.applications({ page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/admin/landlord-applications', { query: { status: undefined, page: 1, limit: 20 } });
    http.post.mockResolvedValue({});
    await H.approveApplication(ID, { reason: 'Đã xác minh' });
    expect(http.post).toHaveBeenLastCalledWith(`/admin/landlord-applications/${ID}/approve`, { reason: 'Đã xác minh' });
    await H.rejectApplication(ID, { reason: 'Thiếu giấy tờ' });
    expect(http.post).toHaveBeenLastCalledWith(`/admin/landlord-applications/${ID}/reject`, { reason: 'Thiếu giấy tờ' });
  });

  it('Users: danh sách (status/search/page/limit), chi tiết, lock/unlock bằng POST riêng', async () => {
    http.get.mockResolvedValue({});
    await H.users({ status: 'DISABLED', search: 'abc', page: 3, limit: 5 });
    expect(http.get).toHaveBeenLastCalledWith('/admin/users', { query: { status: 'DISABLED', search: 'abc', page: 3, limit: 5 } });
    await H.user(ID);
    expect(http.get).toHaveBeenLastCalledWith(`/admin/users/${ID}`);
    http.post.mockResolvedValue({});
    await H.lockUser(ID, { reason: 'Spam' });
    expect(http.post).toHaveBeenLastCalledWith(`/admin/users/${ID}/lock`, { reason: 'Spam' });
    await H.unlockUser(ID, { reason: 'Đã xác minh lại' });
    expect(http.post).toHaveBeenLastCalledWith(`/admin/users/${ID}/unlock`, { reason: 'Đã xác minh lại' });
  });

  it('Listings: hidden/published/workspaceId/page/limit; hide/restore bằng POST kèm { reason }', async () => {
    http.get.mockResolvedValue({});
    await H.listings({ hidden: true, published: false, workspaceId: ID, page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/admin/listings', { query: { hidden: true, published: false, workspaceId: ID, page: 1, limit: 20 } });
    await H.listings({ page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith('/admin/listings', { query: { hidden: undefined, published: undefined, workspaceId: undefined, page: 1, limit: 20 } });
    http.post.mockResolvedValue({});
    await H.hideListing(ID, { reason: 'Ảnh sai sự thật' });
    expect(http.post).toHaveBeenLastCalledWith(`/admin/listings/${ID}/hide`, { reason: 'Ảnh sai sự thật' });
    await H.restoreListing(ID, { reason: 'Đã sửa' });
    expect(http.post).toHaveBeenLastCalledWith(`/admin/listings/${ID}/restore`, { reason: 'Đã sửa' });
  });

  it('Audit: lọc actorUserId/action/targetType/targetId/from/to + phân trang', async () => {
    http.get.mockResolvedValue({});
    await H.auditLogs({ actorUserId: ID, action: 'USER_LOCK', targetType: 'USER', targetId: ID, from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z', page: 2, limit: 50 });
    expect(http.get).toHaveBeenLastCalledWith('/admin/audit-logs', {
      query: { actorUserId: ID, action: 'USER_LOCK', targetType: 'USER', targetId: ID, from: '2026-10-01T00:00:00.000Z', to: '2026-10-02T00:00:00.000Z', page: 2, limit: 50 },
    });
  });

  it('không dùng PATCH, /admin/overview, /admin/workspaces; đúng 11 lời gọi HTTP', () => {
    const api = strip(apiSource);
    expect(api).not.toMatch(/httpClient\.(patch|delete|put)\(/);
    expect(api).not.toMatch(/\/admin\/(overview|workspaces)|users\/\$\{id\}`\s*,\s*\{\s*status/);
    expect(api.match(/httpClient\.(get|post)\(/g) ?? []).toHaveLength(11);
    expect(strip(hooksSource)).not.toMatch(/overview|workspaces/i);
  });
});

// ===================================================================== Model
describe('model', () => {
  it('lý do: bắt buộc, cắt khoảng trắng, tối đa 500 ký tự; thân gửi đi là { reason } (không phải note)', () => {
    expect(reasonSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(reasonSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(reasonSchema.safeParse({ reason: 'x'.repeat(500) }).success).toBe(true);
    expect(reasonSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    expect(toReasonBody({ reason: '  Đã xác minh  ' })).toEqual({ reason: 'Đã xác minh' });
    expect(Object.keys(toReasonBody({ reason: 'a' }))).toEqual(['reason']);
    expect(strip(modelSource + apiSource)).not.toMatch(/LandlordApplicationDecisionRequest|\bnote\b/);
  });
  it('chỉ đơn PENDING mới quyết định được; đơn của chính admin bị chặn', () => {
    expect(canDecide({ status: 'PENDING' })).toBe(true);
    expect(canDecide({ status: 'APPROVED' })).toBe(false);
    expect(canDecide({ status: 'REJECTED' })).toBe(false);
    expect(isOwnApplication({ user: { id: 'a', email: 'x', displayName: null } }, 'a')).toBe(true);
    expect(isOwnApplication({ user: { id: 'a', email: 'x', displayName: null } }, 'b')).toBe(false);
    expect(isOwnApplication({ user: { id: 'a', email: 'x', displayName: null } }, undefined)).toBe(false);
    expect(Object.keys(APPLICATION_STATUS)).toEqual(['PENDING', 'APPROVED', 'REJECTED']);
  });
  it('lọc nhật ký: chỉ USER/LISTING, không có LANDLORD_APPLICATION; sự kiện lạ hiển thị nguyên văn', () => {
    expect(isFilterableTarget('USER')).toBe(true);
    expect(isFilterableTarget('LISTING')).toBe(true);
    expect(isFilterableTarget('LANDLORD_APPLICATION')).toBe(false);
    expect(isFilterableTarget('')).toBe(false);
    expect(auditActionLabel('USER_LOCK')).toBe('Khóa tài khoản');
    expect(auditActionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(Object.keys(AUDIT_ACTION)).toContain('LANDLORD_APPLICATION_APPROVED');
  });
  it('khoảng ngày (giờ Việt Nam): from bao gồm, to không bao gồm = đầu ngày kế tiếp; sai định dạng bị bỏ', () => {
    expect(auditRange('2026-10-01', '2026-10-01')).toEqual({ from: '2026-09-30T17:00:00.000Z', to: '2026-10-01T17:00:00.000Z' });
    expect(auditRange('2026-10-01', '')).toEqual({ from: '2026-09-30T17:00:00.000Z' });
    expect(auditRange('', '2026-12-31')).toEqual({ to: '2026-12-31T17:00:00.000Z' });
    expect(auditRange('01/10/2026', 'abc')).toEqual({});
  });
  it('thông báo lỗi theo mã backend', () => {
    const e = (statusCode: number, code?: string) => new ApiError({ statusCode, code, message: 'raw' });
    expect(adminErrorMessage(e(409, 'ADMIN_TARGET_PROTECTED'))).toMatch(/chính bạn|Platform Admin khác/);
    expect(adminErrorMessage(e(409, 'ADMIN_STATE_UNCHANGED'))).toMatch(/đã như vậy/);
    expect(adminErrorMessage(e(409, 'LANDLORD_APPLICATION_INVALID_TRANSITION'))).toMatch(/đã được xử lý|của chính bạn/);
    expect(adminErrorMessage(e(404, 'ADMIN_USER_NOT_FOUND'))).toMatch(/Không tìm thấy người dùng/);
    expect(adminErrorMessage(e(404, 'LISTING_NOT_FOUND'))).toMatch(/Không tìm thấy tin đăng/);
    expect(adminErrorMessage(e(403))).toMatch(/Platform Admin/);
    expect(adminErrorMessage(e(401))).toMatch(/hết hạn/);
    expect(adminErrorMessage(e(500))).toBe('raw');
  });
});

// ===================================================================== Chính sách V1 / điều hướng / guard
describe('chính sách V1 của khu quản trị', () => {
  it('không còn mục chỉ có ở mock: SĐT, vai trò, số workspace, hoạt động cuối, báo cáo, IP, nhóm tự bịa, biểu đồ', () => {
    const ui = strip(dashSource + userPagesSource + partsSource + modelSource);
    expect(ui).not.toMatch(/\bphone\b|globalRole|workspaceCount|lastActiveAt|reportCount|reportReason|REPORTED|\bip\b|category|BarChart|AdminOverview|signupsByDay|useAdminOverview/);
    expect(strip(mockSource)).not.toMatch(/reportCount|REPORTED|lastActiveAt|globalRole: u|workspaceCount|overview/);
  });
  it('không còn quản trị Workspace: không route, không menu, không API', () => {
    expect(strip(routerSource)).not.toMatch(/admin\/workspaces|AdminWorkspacesPage|'workspaces',\s*element:\s*lazyPage\(adminPages/);
    expect(strip(layoutSource)).not.toMatch(/workspaces/i);
    expect(layoutSource).toMatch(/\/admin\/applications/);
    expect(strip(dashSource + userPagesSource)).not.toMatch(/AdminWorkspace|setWorkspaceStatus/);
  });
  it('xem trước tin đăng bằng id tin đăng công khai (listing.id), không dùng roomId', () => {
    expect(userPagesSource).toMatch(/\/rooms\/\$\{l\.id\}/);
    expect(userPagesSource).not.toMatch(/\/rooms\/\$\{l\.roomId\}/);
  });
  it('route /admin chỉ dành cho quyền admin thật; OWNER/tenant không tự có quyền admin', () => {
    expect(routerSource).toMatch(/path: 'admin',\s*element: \(\s*<RequireArea area="admin">/);
    const base = { workspaces: [], tenantLinks: [], landlordApplication: null };
    expect(areasOf({ ...base, workspaces: [{ id: 'w', name: 'W', status: 'ACTIVE', role: 'OWNER' }], isPlatformAdmin: false })).toEqual(['market', 'landlord']);
    expect(areasOf({ ...base, tenantLinks: [{ tenantId: 't', workspaceId: 'w', tenantName: 'T', workspaceName: 'W' }], isPlatformAdmin: false })).toEqual(['market', 'tenant']);
    expect(areasOf({ ...base, isPlatformAdmin: true })).toEqual(['market', 'admin']);
  });
});

// ===================================================================== Mock theo đúng backend
const as = (id: string, globalRole: 'ADMIN' | 'USER' = 'ADMIN') => {
  ctl.record = { user: { id, fullName: id, email: `${id}@x.vn`, globalRole, tenantLinked: false, createdAt: '2024-01-01T00:00:00.000Z' }, memberships: [] };
};
const P = { page: 1, limit: 100 };
const ADMIN = 'u-admin';

describe('mock: phân quyền và phân trang', () => {
  it('mọi endpoint từ chối người không phải Platform Admin bằng 403 PLATFORM_ADMIN_REQUIRED', async () => {
    as('u-owner', 'USER');
    const denied = { status: 403, code: 'PLATFORM_ADMIN_REQUIRED' };
    for (const call of [
      () => adminMock.applications(P),
      () => adminMock.approveApplication('la-seed-1', { reason: 'x' }),
      () => adminMock.rejectApplication('la-seed-1', { reason: 'x' }),
      () => adminMock.users(P),
      () => adminMock.user('u-x0'),
      () => adminMock.lockUser('u-x0', { reason: 'x' }),
      () => adminMock.unlockUser('u-x0', { reason: 'x' }),
      () => adminMock.listings(P),
      () => adminMock.hideListing('r-1', { reason: 'x' }),
      () => adminMock.restoreListing('r-1', { reason: 'x' }),
      () => adminMock.auditLogs(P),
    ]) await expect(call()).rejects.toMatchObject(denied);
  });
  it('luôn trả về trang { items, page, limit, total }; tham số sai → 400', async () => {
    as(ADMIN);
    const page = await adminMock.users({ page: 2, limit: 5 });
    expect(page).toMatchObject({ page: 2, limit: 5 });
    expect(page.items).toHaveLength(5);
    expect(page.total).toBeGreaterThan(10);
    await expect(adminMock.users({ page: 0, limit: 20 })).rejects.toMatchObject({ status: 400 });
    await expect(adminMock.users({ page: 1, limit: 101 })).rejects.toMatchObject({ status: 400 });
    ctl.empty = true;
    expect((await adminMock.users(P)).items).toEqual([]);
  });
});

describe('mock: đơn đăng ký chủ trọ', () => {
  it('danh sách lọc trạng thái, cũ nhất trước, có người nộp, không có email nào bị bịa', async () => {
    as(ADMIN);
    const pending = await adminMock.applications({ status: 'PENDING', page: 1, limit: 20 });
    expect(pending.items.every((a) => a.status === 'PENDING' && a.user.email)).toBe(true);
    expect(pending.items.map((a) => a.createdAt)).toEqual([...pending.items.map((a) => a.createdAt)].sort());
    expect(pending.items[0]).toMatchObject({ reason: expect.any(String), decisionNote: null, decidedByUserId: null, decidedAt: null, user: { id: expect.any(String), email: expect.any(String) } });
    const all = await adminMock.applications({ page: 1, limit: 20 });
    expect(all.total).toBeGreaterThan(pending.total);
    expect((await adminMock.applications({ status: 'APPROVED', page: 1, limit: 20 })).items.every((a) => a.decidedByUserId)).toBe(true);
    expect((await adminMock.applications({ page: 1, limit: 1 })).items).toHaveLength(1);
    await expect(adminMock.applications({ status: 'X' as never, page: 1, limit: 20 })).rejects.toMatchObject({ status: 400 });
  });

  it('lý do bắt buộc ≤500; admin không tự duyệt đơn của mình; đơn không tồn tại 404', async () => {
    as(ADMIN);
    await expect(adminMock.approveApplication('la-seed-1', { reason: '   ' })).rejects.toMatchObject({ status: 400 });
    await expect(adminMock.approveApplication('la-seed-1', { reason: 'x'.repeat(501) })).rejects.toMatchObject({ status: 400 });
    await expect(adminMock.approveApplication('la-seed-3', { reason: 'Tự duyệt' })).rejects.toMatchObject({ status: 409, code: 'LANDLORD_APPLICATION_INVALID_TRANSITION' });
    await expect(adminMock.rejectApplication('la-seed-3', { reason: 'Tự từ chối' })).rejects.toMatchObject({ status: 409 });
    await expect(adminMock.approveApplication('khong-co', { reason: 'x' })).rejects.toMatchObject({ status: 404, code: 'LANDLORD_APPLICATION_NOT_FOUND' });
  });

  it('duyệt/từ chối đúng một lần: đổi trạng thái, ghi lý do vào decisionNote, ghi audit; quyết định lại → 409', async () => {
    as(ADMIN);
    const approved = await adminMock.approveApplication('la-seed-1', { reason: '  Đã xác minh giấy tờ  ' });
    expect(approved).toMatchObject({ id: 'la-seed-1', status: 'APPROVED', decisionNote: 'Đã xác minh giấy tờ', decidedByUserId: ADMIN });
    expect(approved.decidedAt).toBeTruthy();
    expect(approved).not.toHaveProperty('user'); // thân trả về là LandlordApplicationResponse
    await expect(adminMock.approveApplication('la-seed-1', { reason: 'Lần 2' })).rejects.toMatchObject({ status: 409 });
    await expect(adminMock.rejectApplication('la-seed-1', { reason: 'Đổi ý' })).rejects.toMatchObject({ status: 409 });
    const rejected = await adminMock.rejectApplication('la-seed-2', { reason: 'Thiếu thông tin' });
    expect(rejected.status).toBe('REJECTED');
    expect((await adminMock.applications({ status: 'PENDING', page: 1, limit: 20 })).items.map((a) => a.id)).toEqual(['la-seed-3']);
    const audit = (await adminMock.auditLogs({ targetId: 'la-seed-1', page: 1, limit: 20 })).items;
    expect(audit[0]).toMatchObject({ action: 'LANDLORD_APPLICATION_APPROVED', targetType: 'LANDLORD_APPLICATION', actorUserId: ADMIN, reason: 'Đã xác minh giấy tờ', metadata: { applicantUserId: 'u-x0', applicationStatus: 'APPROVED' } });
  });

  it('đơn do người dùng tự nộp xuất hiện cho admin và duyệt thì đổi đúng quyền (capabilities.landlordApplication)', async () => {
    const mine = { id: 'la-mine', status: 'PENDING' as const, reason: 'Tôi muốn cho thuê', decisionNote: null, decidedByUserId: null, decidedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    mockLandlordApplications.set('u-guest', mine);
    as(ADMIN);
    const row = (await adminMock.applications({ status: 'PENDING', page: 1, limit: 50 })).items.find((a) => a.id === 'la-mine');
    expect(row?.user.id).toBe('u-guest');
    await adminMock.approveApplication('la-mine', { reason: 'OK' });
    as('u-guest', 'USER');
    expect((await capabilitiesMock.get()).landlordApplication).toMatchObject({ id: 'la-mine', status: 'APPROVED', decisionNote: 'OK' });
    expect((await capabilitiesMock.get()).workspaces).toEqual([]); // duyệt không tự tạo workspace
    mockLandlordApplications.delete('u-guest');
  });
});

describe('mock: người dùng', () => {
  it('lọc trạng thái, tìm theo đoạn email (không phân biệt hoa thường), chi tiết có đếm thật, không có trường giả', async () => {
    as(ADMIN);
    expect((await adminMock.users({ status: 'DISABLED', page: 1, limit: 100 })).items.map((u) => u.email)).toEqual(['spam.user@mail.vn']);
    expect((await adminMock.users({ search: 'SPAM', page: 1, limit: 100 })).total).toBe(1);
    expect((await adminMock.users({ search: 'khong-co-email-nay', page: 1, limit: 100 })).total).toBe(0);
    const first = (await adminMock.users(P)).items[0]!;
    expect(Object.keys(first).sort()).toEqual(['createdAt', 'disabledAt', 'displayName', 'email', 'id', 'isPlatformAdmin', 'status']);
    const detail = await adminMock.user('u-x6');
    expect(detail).toMatchObject({ status: 'DISABLED', activeSessionCount: 0, lastModerationReason: 'Tài khoản spam, đăng tin rác.' });
    expect(typeof detail.workspaceMembershipCount).toBe('number');
    await expect(adminMock.user('khong-co')).rejects.toMatchObject({ status: 404, code: 'ADMIN_USER_NOT_FOUND' });
  });

  it('khóa/mở khóa: lý do bắt buộc, ghi audit, lặp lại 409; không khóa chính mình hay Platform Admin; mở khóa đảo ngược', async () => {
    as(ADMIN);
    await expect(adminMock.lockUser('u-x4', { reason: '' })).rejects.toMatchObject({ status: 400 });
    await expect(adminMock.lockUser(ADMIN, { reason: 'Tự khóa' })).rejects.toMatchObject({ status: 409, code: 'ADMIN_TARGET_PROTECTED' });
    await expect(adminMock.lockUser('khong-co', { reason: 'x' })).rejects.toMatchObject({ status: 404 });
    const locked = await adminMock.lockUser('u-x4', { reason: ' Đăng tin lừa đảo ' });
    expect(locked).toMatchObject({ id: 'u-x4', status: 'DISABLED' });
    expect(locked.disabledAt).toBeTruthy();
    await expect(adminMock.lockUser('u-x4', { reason: 'Lần 2' })).rejects.toMatchObject({ status: 409, code: 'ADMIN_STATE_UNCHANGED' });
    expect((await adminMock.user('u-x4')).lastModerationReason).toBe('Đăng tin lừa đảo');
    const unlocked = await adminMock.unlockUser('u-x4', { reason: 'Đã xác minh lại' });
    expect(unlocked).toMatchObject({ status: 'ACTIVE', disabledAt: null });
    await expect(adminMock.unlockUser('u-x4', { reason: 'Lần 2' })).rejects.toMatchObject({ status: 409, code: 'ADMIN_STATE_UNCHANGED' });
    const log = (await adminMock.auditLogs({ targetType: 'USER', targetId: 'u-x4', page: 1, limit: 10 })).items;
    expect(log.map((l) => l.action)).toEqual(['USER_UNLOCK', 'USER_LOCK']);
    expect(log[1]!.metadata).toEqual({ previousStatus: 'ACTIVE', newStatus: 'DISABLED', revokedSessions: 1 });
  });

  it('không khóa được Platform Admin khác', async () => {
    as(ADMIN);
    const other = (await adminMock.users(P)).items.find((u) => u.isPlatformAdmin && u.id !== ADMIN);
    if (!other) {
      expect((await adminMock.users(P)).items.filter((u) => u.isPlatformAdmin)).toHaveLength(1); // chỉ có một admin demo: đã được test ở nhánh tự khóa
      return;
    }
    await expect(adminMock.lockUser(other.id, { reason: 'x' })).rejects.toMatchObject({ code: 'ADMIN_TARGET_PROTECTED' });
  });
});

describe('mock: tin đăng', () => {
  it('lọc hidden/published/workspaceId, tiền là chuỗi thập phân, không có báo cáo/trạng thái giả', async () => {
    as(ADMIN);
    const all = await adminMock.listings(P);
    expect(all.items.every((l) => /^\d+\.\d{2}$/.test(l.monthlyRent))).toBe(true);
    expect(Object.keys(all.items[0]!).sort()).toEqual(['buildingName', 'city', 'id', 'isHidden', 'isPublished', 'moderatedAt', 'moderationReason', 'monthlyRent', 'roomCode', 'roomId', 'workspaceId']);
    expect((await adminMock.listings({ published: false, page: 1, limit: 100 })).items.every((l) => !l.isPublished)).toBe(true);
    expect((await adminMock.listings({ workspaceId: 'ws-sunhouse', page: 1, limit: 100 })).items.every((l) => l.workspaceId === 'ws-sunhouse')).toBe(true);
    expect((await adminMock.listings({ hidden: true, page: 1, limit: 100 })).total).toBe(0);
  });

  it('ẩn/khôi phục: lý do bắt buộc, không đổi isPublished, lặp lại 409, ghi audit, marketplace mock ẩn tin', async () => {
    as(ADMIN);
    const before = (await adminMock.listings(P)).items.find((l) => l.id === 'r-2')!;
    await expect(adminMock.hideListing('r-2', { reason: ' ' })).rejects.toMatchObject({ status: 400 });
    await expect(adminMock.hideListing('khong-co', { reason: 'x' })).rejects.toMatchObject({ status: 404, code: 'LISTING_NOT_FOUND' });
    await expect(adminMock.restoreListing('r-2', { reason: 'x' })).rejects.toMatchObject({ status: 409, code: 'ADMIN_STATE_UNCHANGED' });
    const hidden = await adminMock.hideListing('r-2', { reason: 'Ảnh không đúng thực tế' });
    expect(hidden).toMatchObject({ id: 'r-2', isHidden: true, moderationReason: 'Ảnh không đúng thực tế', isPublished: before.isPublished });
    expect(hidden.moderatedAt).toBeTruthy();
    expect(isListingRemoved('r-2')).toBe(true);
    await expect(adminMock.hideListing('r-2', { reason: 'Lần 2' })).rejects.toMatchObject({ status: 409, code: 'ADMIN_STATE_UNCHANGED' });
    expect((await adminMock.listings({ hidden: true, page: 1, limit: 100 })).items.map((l) => l.id)).toEqual(['r-2']);
    expect((await adminMock.listings(P)).items[0]!.id).toBe('r-2'); // mới cập nhật lên đầu
    const restored = await adminMock.restoreListing('r-2', { reason: 'Đã bổ sung ảnh thật' });
    expect(restored).toMatchObject({ isHidden: false, moderationReason: 'Đã bổ sung ảnh thật', isPublished: before.isPublished });
    expect(isListingRemoved('r-2')).toBe(false);
    const log = (await adminMock.auditLogs({ targetType: 'LISTING', targetId: 'r-2', page: 1, limit: 10 })).items;
    expect(log.map((l) => l.action)).toEqual(['LISTING_RESTORE', 'LISTING_HIDE']);
    expect(log[1]).toMatchObject({ actorUserId: ADMIN, targetType: 'LISTING', reason: 'Ảnh không đúng thực tế', metadata: { workspaceId: expect.any(String), roomId: 'room-r-2' } });
  });
});

describe('mock: nhật ký', () => {
  it('đúng trường backend lưu (không email/IP/nhãn bịa), mới nhất trước, lọc action/actor/targetType/targetId, from gồm – to không gồm', async () => {
    as(ADMIN);
    const all = await adminMock.auditLogs(P);
    expect(all.total).toBeGreaterThanOrEqual(5);
    for (const l of all.items) {
      expect(Object.keys(l).sort()).toEqual(['action', 'actorUserId', 'createdAt', 'id', 'metadata', 'reason', 'targetId', 'targetType']);
      expect(JSON.stringify(l.metadata)).not.toMatch(/@|\bip\b/i);
    }
    expect(all.items.map((l) => l.createdAt)).toEqual([...all.items.map((l) => l.createdAt)].sort().reverse());
    expect((await adminMock.auditLogs({ action: 'USER_LOCK', page: 1, limit: 100 })).items.every((l) => l.action === 'USER_LOCK')).toBe(true);
    expect((await adminMock.auditLogs({ actorUserId: 'ai-do', page: 1, limit: 100 })).total).toBe(0);
    expect((await adminMock.auditLogs({ targetType: 'LISTING', page: 1, limit: 100 })).items.every((l) => l.targetType === 'LISTING')).toBe(true);
    const oldest = all.items.at(-1)!;
    const t = Date.parse(oldest.createdAt);
    expect((await adminMock.auditLogs({ from: new Date(t).toISOString(), page: 1, limit: 100 })).total).toBe(all.total);
    expect((await adminMock.auditLogs({ to: new Date(t).toISOString(), page: 1, limit: 100 })).total).toBe(0); // `to` không bao gồm
    expect((await adminMock.auditLogs({ to: new Date(t + 1).toISOString(), page: 1, limit: 100 })).items.map((l) => l.id)).toContain(oldest.id);
    expect((await adminMock.auditLogs({ page: 1, limit: 2 })).items).toHaveLength(2);
  });
  it('backend chỉ nhận lọc đối tượng USER/LISTING: LANDLORD_APPLICATION bị từ chối 400', async () => {
    as(ADMIN);
    await expect(adminMock.auditLogs({ targetType: 'LANDLORD_APPLICATION' as never, page: 1, limit: 20 })).rejects.toMatchObject({ status: 400 });
  });
});
