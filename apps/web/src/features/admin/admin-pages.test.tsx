import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAuditLogResponse, AdminListingResponse, AdminUserResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/features/auth/hooks', () => ({ useCurrentUser: () => ({ data: { id: 'me-admin', fullName: 'Admin' } }) }));

import { ToastProvider } from '@/components/ui';
import { ApiError } from '@/services/http/ApiError';
import { AdminApplicationsPage, AdminDashboardPage, AuditLogsPage } from '@/pages/admin/AdminPages';
import { AdminListingsPage, AdminUserDetailPage, AdminUsersPage } from '@/pages/admin/AdminUserPages';
import type { AdminLandlordApplication } from './api';

const T = '2026-10-15T03:00:00.000Z';
const app = (o: Partial<AdminLandlordApplication> = {}): AdminLandlordApplication => ({
  id: 'a1', status: 'PENDING', reason: 'Tôi có 10 phòng trọ', decisionNote: null, decidedByUserId: null, decidedAt: null, createdAt: T, updatedAt: T,
  user: { id: 'u1', email: 'chu@x.vn', displayName: 'Chủ Trọ' }, ...o,
});
const user = (o: Partial<AdminUserResponse> = {}): AdminUserResponse => ({ id: 'u1', email: 'nam@x.vn', displayName: 'Nam', status: 'ACTIVE', isPlatformAdmin: false, disabledAt: null, createdAt: T, ...o });
const listing = (o: Partial<AdminListingResponse> = {}): AdminListingResponse => ({
  id: 'lst-1', workspaceId: 'w1', roomId: 'room-1', roomCode: 'P.101', buildingName: 'Tòa A', city: 'Hà Nội', monthlyRent: '3500000.00', isPublished: true, isHidden: false, moderationReason: null, moderatedAt: null, ...o,
});
const audit = (o: Partial<AdminAuditLogResponse> = {}): AdminAuditLogResponse => ({
  id: 'l1', actorUserId: 'actor-1', action: 'USER_LOCK', targetType: 'USER', targetId: 'u1', reason: 'Spam', metadata: { previousStatus: 'ACTIVE', revokedSessions: 2 }, createdAt: T, ...o,
});
const page = <I,>(items: I[], total = items.length) => ({ items, page: 1, limit: 20, total });

type Query = Record<string, unknown> | undefined;
function serve(table: Record<string, unknown | ((q: Query) => unknown)>) {
  http.get.mockImplementation(async (url: string, opts?: { query?: Query }) => {
    if (url in table) {
      const v = table[url];
      return typeof v === 'function' ? (v as (q: Query) => unknown)(opts?.query) : v;
    }
    throw new Error(`unrouted GET ${url}`);
  });
}
function mount(entry: string, routes: RouteObject[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [entry] })} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const err = (statusCode: number, code: string) => new ApiError({ statusCode, code, message: 'raw' });

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('Tổng quan', () => {
  it('chỉ tổng hợp từ endpoint quản trị thật; không gọi /admin/overview và không có biểu đồ', async () => {
    serve({
      '/admin/landlord-applications': page([], 3),
      '/admin/users': (q: Query) => page([], q?.status === 'DISABLED' ? 2 : 40),
      '/admin/listings': (q: Query) => page([], q?.hidden === true ? 4 : 25),
      '/admin/audit-logs': page([audit({ action: 'LISTING_HIDE', targetType: 'LISTING', targetId: 'lst-9' })]),
    });
    mount('/admin', [{ path: '/admin', element: <AdminDashboardPage /> }]);
    expect(await screen.findByText('40')).toBeTruthy();
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText('Đơn chủ trọ chờ duyệt')).toBeTruthy();
    expect(await screen.findByText('Ẩn tin đăng')).toBeTruthy();
    const urls = http.get.mock.calls.map((c) => c[0]);
    expect(urls).not.toContain('/admin/overview');
    expect(urls.every((u) => u.startsWith('/admin/'))).toBe(true);
    expect(screen.queryByText(/Workspace|7 ngày|Doanh thu|báo cáo/i)).toBeNull();
  });
});

describe('Đơn đăng ký chủ trọ', () => {
  const routes: RouteObject[] = [{ path: '/admin/applications', element: <AdminApplicationsPage /> }];

  it('chỉ đơn PENDING có nút; đơn của chính admin bị chặn; đơn đã xử lý hiện quyết định', async () => {
    serve({
      '/admin/landlord-applications': page([
        app(),
        app({ id: 'a2', user: { id: 'me-admin', email: 'admin@x.vn', displayName: null } }),
        app({ id: 'a3', status: 'REJECTED', decisionNote: 'Thiếu giấy tờ', decidedAt: T, decidedByUserId: 'x', user: { id: 'u3', email: 'c@x.vn', displayName: 'C' } }),
      ]),
    });
    mount('/admin/applications?status=', routes);
    expect(await screen.findByText('Chủ Trọ')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Duyệt' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Từ chối' })).toHaveLength(1);
    expect(screen.getByText(/không tự duyệt được/)).toBeTruthy();
    expect(screen.getByText('Thiếu giấy tờ')).toBeTruthy();
    expect(screen.getByText(/không tự tạo workspace/)).toBeTruthy();
  });

  it('duyệt bắt buộc lý do (≤500) và gửi đúng { reason } tới /approve; sau đó làm mới danh sách', async () => {
    serve({ '/admin/landlord-applications': page([app()]) });
    http.post.mockResolvedValue({});
    mount('/admin/applications', routes);
    await userEvent.click(await screen.findByRole('button', { name: 'Duyệt' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Duyệt đơn' }));
    expect(await within(dlg).findByText('Nhập lý do')).toBeTruthy();
    expect(http.post).not.toHaveBeenCalled();
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), '  Đã xác minh giấy tờ ');
    const before = http.get.mock.calls.length;
    await userEvent.click(within(dlg).getByRole('button', { name: 'Duyệt đơn' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/admin/landlord-applications/a1/approve', { reason: 'Đã xác minh giấy tờ' }));
    expect(await screen.findByText('Đã duyệt đơn.')).toBeTruthy();
    await waitFor(() => expect(http.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('từ chối gửi tới /reject; lỗi 409 (đơn đã xử lý) hiện thông báo và đóng hộp thoại', async () => {
    serve({ '/admin/landlord-applications': page([app()]) });
    http.post.mockRejectedValue(err(409, 'LANDLORD_APPLICATION_INVALID_TRANSITION'));
    mount('/admin/applications', routes);
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), 'Không đủ thông tin');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Từ chối đơn' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/admin/landlord-applications/a1/reject', { reason: 'Không đủ thông tin' }));
    expect(await screen.findByText(/đã được xử lý|của chính bạn/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('lọc trạng thái và phân trang gửi đúng query', async () => {
    serve({ '/admin/landlord-applications': () => page([app()], 45) });
    mount('/admin/applications?status=PENDING', routes);
    await screen.findByText('Chủ Trọ');
    expect(http.get).toHaveBeenLastCalledWith('/admin/landlord-applications', { query: { status: 'PENDING', page: 1, limit: 20 } });
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/admin/landlord-applications', { query: { status: 'PENDING', page: 2, limit: 20 } }));
    await userEvent.selectOptions(screen.getByLabelText('Trạng thái đơn'), 'REJECTED');
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith('/admin/landlord-applications', { query: { status: 'REJECTED', page: 1, limit: 20 } }));
  });
});

describe('Người dùng', () => {
  const routes: RouteObject[] = [
    { path: '/admin/users', element: <AdminUsersPage /> },
    { path: '/admin/users/:userId', element: <AdminUserDetailPage /> },
  ];

  it('chỉ hiển thị trường backend có; khóa bị ẩn với Platform Admin và chính mình; khóa gửi { reason } tới /lock', async () => {
    serve({
      '/admin/users': page([
        user(),
        user({ id: 'adm', email: 'boss@x.vn', displayName: 'Boss', isPlatformAdmin: true }),
        user({ id: 'me-admin', email: 'me@x.vn', displayName: 'Tôi', isPlatformAdmin: true }),
        user({ id: 'u9', email: 'spam@x.vn', displayName: 'Spam', status: 'DISABLED', disabledAt: T }),
      ]),
    });
    http.post.mockResolvedValue({});
    mount('/admin/users', routes);
    expect(await screen.findByText('Nam')).toBeTruthy();
    expect(screen.getAllByText('Platform Admin')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Khóa' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Mở khóa' })).toHaveLength(1);
    expect(screen.queryByText(/Vai trò|Workspace|Hoạt động cuối|SĐT|\b09\d{8}\b/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Khóa' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), 'Đăng tin rác');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Khóa tài khoản' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/admin/users/u1/lock', { reason: 'Đăng tin rác' }));
    expect(http.patch).not.toHaveBeenCalled();
  });

  it('mở khóa gửi tới /unlock; tìm theo email và lọc trạng thái gửi đúng query', async () => {
    serve({ '/admin/users': page([user({ id: 'u9', email: 'spam@x.vn', status: 'DISABLED', disabledAt: T })]) });
    http.post.mockResolvedValue({});
    mount('/admin/users?status=DISABLED&search=spam', routes);
    await screen.findByText('spam@x.vn');
    expect(http.get).toHaveBeenLastCalledWith('/admin/users', { query: { status: 'DISABLED', search: 'spam', page: 1, limit: 20 } });
    await userEvent.click(screen.getByRole('button', { name: 'Mở khóa' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), 'Đã xác minh');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Mở khóa' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/admin/users/u9/unlock', { reason: 'Đã xác minh' }));
  });

  it('chi tiết dùng endpoint riêng và hiện đếm thật; 404 có đường về danh sách', async () => {
    serve({ '/admin/users/u1': { ...user(), workspaceMembershipCount: 2, activeSessionCount: 3, lastModerationReason: 'Mở lại sau khi xác minh' } });
    mount('/admin/users/u1', routes);
    expect(await screen.findByText('Phiên đăng nhập đang hoạt động')).toBeTruthy();
    expect(screen.getByText('Mở lại sau khi xác minh')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xem nhật ký của tài khoản/ }).getAttribute('href')).toBe('/admin/audit-logs?targetType=USER&targetId=u1');
    expect(http.get).toHaveBeenCalledWith('/admin/users/u1');
  });

  it('chi tiết người dùng không tồn tại → 404 với thông báo tiếng Việt', async () => {
    serve({ '/admin/users/u0': () => { throw err(404, 'ADMIN_USER_NOT_FOUND'); } });
    mount('/admin/users/u0', routes);
    expect(await screen.findByText('Không tìm thấy người dùng.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Về danh sách người dùng/ })).toBeTruthy();
  });
});

describe('Tin đăng', () => {
  const routes: RouteObject[] = [{ path: '/admin/listings', element: <AdminListingsPage /> }];

  it('xem trước bằng id tin đăng; tin bị ẩn/chưa đăng không có liên kết công khai; không có báo cáo giả; ẩn gửi { reason } tới /hide', async () => {
    serve({ '/admin/listings': page([listing(), listing({ id: 'lst-2', roomCode: 'P.102', isHidden: true, moderationReason: 'Ảnh sai', moderatedAt: T }), listing({ id: 'lst-3', roomCode: 'P.103', isPublished: false })]) });
    http.post.mockResolvedValue({});
    mount('/admin/listings', routes);
    const link = await screen.findByRole('link', { name: /Phòng P\.101/ });
    expect(link.getAttribute('href')).toBe('/rooms/lst-1'); // listing.id, không phải roomId
    expect(screen.queryByRole('link', { name: /P\.102/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /P\.103/ })).toBeNull();
    expect(screen.queryByText(/báo cáo|Bị báo cáo|REPORTED/i)).toBeNull();
    expect(screen.getByText('Ảnh sai')).toBeTruthy();
    expect(screen.getAllByText(/3\.500\.000/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Ẩn tin' })[0]!);
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Ẩn tin' }));
    expect(await within(dlg).findByText('Nhập lý do')).toBeTruthy();
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), 'Ảnh không đúng thực tế');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Ẩn tin' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/admin/listings/lst-1/hide', { reason: 'Ảnh không đúng thực tế' }));
  });

  it('khôi phục gửi tới /restore; bộ lọc hidden/published/workspaceId gửi đúng query', async () => {
    serve({ '/admin/listings': page([listing({ isHidden: true, moderationReason: 'Ảnh sai', moderatedAt: T })]) });
    http.post.mockResolvedValue({});
    mount('/admin/listings?hidden=true&published=true&workspaceId=11111111-1111-4111-8111-111111111111', routes);
    await screen.findByText('Ảnh sai');
    expect(http.get).toHaveBeenLastCalledWith('/admin/listings', { query: { hidden: true, published: true, workspaceId: '11111111-1111-4111-8111-111111111111', page: 1, limit: 20 } });
    await userEvent.click(screen.getByRole('button', { name: 'Khôi phục' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), 'Đã bổ sung ảnh thật');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(http.post).toHaveBeenCalledWith('/admin/listings/lst-1/restore', { reason: 'Đã bổ sung ảnh thật' }));
  });

  it('409 ADMIN_STATE_UNCHANGED hiện thông báo rõ ràng', async () => {
    serve({ '/admin/listings': page([listing()]) });
    http.post.mockRejectedValue(err(409, 'ADMIN_STATE_UNCHANGED'));
    mount('/admin/listings', routes);
    await userEvent.click(await screen.findByRole('button', { name: 'Ẩn tin' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/^Lý do/), 'x');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Ẩn tin' }));
    expect(await screen.findByText(/đã như vậy rồi/)).toBeTruthy();
  });
});

describe('Nhật ký', () => {
  const routes: RouteObject[] = [{ path: '/admin/audit-logs', element: <AuditLogsPage /> }];

  it('hiện đúng trường backend (actorUserId, action, targetType/targetId, lý do, metadata); không bịa email/IP/nhóm', async () => {
    serve({ '/admin/audit-logs': page([audit(), audit({ id: 'l2', action: 'LANDLORD_APPLICATION_APPROVED', targetType: 'LANDLORD_APPLICATION', targetId: 'app-1', reason: 'Đã xác minh', metadata: { applicantUserId: 'u7' } })]) });
    mount('/admin/audit-logs', routes);
    expect(await screen.findAllByText('actor-1')).toHaveLength(2);
    expect(screen.getByText('Khóa tài khoản', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Duyệt đơn chủ trọ', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('revokedSessions')).toBeTruthy();
    expect(screen.getByText('app-1')).toBeTruthy();
    expect(screen.getByText('Spam')).toBeTruthy();
    expect(screen.queryByText(/@|IP|Nhóm/)).toBeNull();
  });

  it('bộ lọc loại đối tượng chỉ có USER/LISTING; khoảng ngày đổi sang giờ Việt Nam (to không bao gồm)', async () => {
    serve({ '/admin/audit-logs': page([audit()]) });
    mount('/admin/audit-logs?targetType=USER&targetId=u1&action=USER_LOCK&actorUserId=actor-1&from=2026-10-01&to=2026-10-02&page=1', routes);
    await screen.findByText('Spam');
    expect(http.get).toHaveBeenLastCalledWith('/admin/audit-logs', {
      query: { actorUserId: 'actor-1', action: 'USER_LOCK', targetType: 'USER', targetId: 'u1', from: '2026-09-30T17:00:00.000Z', to: '2026-10-02T17:00:00.000Z', page: 1, limit: 20 },
    });
    const options = within(screen.getByLabelText('Loại đối tượng')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(options).toEqual(['', 'USER', 'LISTING']);
  });

  it('loại đối tượng không hợp lệ trong URL (LANDLORD_APPLICATION) không bao giờ được gửi lên backend', async () => {
    serve({ '/admin/audit-logs': page([]) });
    mount('/admin/audit-logs?targetType=LANDLORD_APPLICATION', routes);
    await screen.findByText('Không có sự kiện phù hợp');
    expect((http.get.mock.calls.at(-1)![1] as { query: Record<string, unknown> }).query.targetType).toBeUndefined();
  });

  it('backend từ chối bộ lọc (400): hiện lỗi, có thể thử lại', async () => {
    serve({ '/admin/audit-logs': () => { throw err(400, 'VALIDATION_ERROR'); } });
    mount('/admin/audit-logs?targetId=khong-phai-uuid', routes);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
