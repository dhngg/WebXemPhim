import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUserResponse, LandlordApplicationResponse, UserCapabilitiesResponse } from '@rental/shared';
import { ToastProvider } from '@/components/ui';
import { WorkspaceSelectPage } from '@/pages/user/UserPages';
import { accessTokenStore } from '@/services/http/accessToken';
import { mockLandlordApplications } from '@/mocks/handlers/landlord-application.mock';
import { workspacesMock } from '@/mocks/handlers/workspaces.mock';
import { mockUsers } from '@/mocks/data/users';
import { mockSession } from '@/mocks/session';
import { creationErrorMessage, workspaceCreation } from './creation';
import { ApiError } from '@/services/http/ApiError';

const ws = (id: string, role: 'OWNER' | 'MANAGER' | 'STAFF' = 'OWNER', status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') => ({
  id,
  name: `Nhà trọ ${id}`,
  status,
  role,
});
const app = (status: LandlordApplicationResponse['status'], extra: Partial<LandlordApplicationResponse> = {}): LandlordApplicationResponse => ({
  id: 'la1',
  status,
  reason: 'Tôi có 10 phòng',
  decisionNote: null,
  decidedByUserId: null,
  decidedAt: status === 'PENDING' ? null : '2026-10-11T00:00:00.000Z',
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  ...extra,
});
const NONE: UserCapabilitiesResponse = { workspaces: [], tenantLinks: [], isPlatformAdmin: false, landlordApplication: null };

describe('workspaceCreation — luật tạo workspace theo quyền thật', () => {
  it('user thường (chưa có đơn) không được tạo, được hướng dẫn nộp đơn', () => {
    expect(workspaceCreation(null).kind).toBe('NEEDS_APPLICATION');
    expect(workspaceCreation(NONE).kind).toBe('NEEDS_APPLICATION');
  });
  it('đơn đang chờ / bị từ chối: không được tạo', () => {
    expect(workspaceCreation({ ...NONE, landlordApplication: app('PENDING') }).kind).toBe('APPLICATION_PENDING');
    expect(workspaceCreation({ ...NONE, landlordApplication: app('REJECTED') }).kind).toBe('APPLICATION_REJECTED');
  });
  it('đơn APPROVED chưa có workspace: được tạo', () => {
    expect(workspaceCreation({ ...NONE, landlordApplication: app('APPROVED') })).toEqual({ kind: 'ALLOWED', viaApplication: true });
  });
  it('OWNER đang có workspace ACTIVE: đạt giới hạn', () => {
    expect(workspaceCreation({ ...NONE, workspaces: [ws('a')], landlordApplication: app('APPROVED') }).kind).toBe('LIMIT_ACTIVE');
  });
  it('OWNER chỉ còn workspace ARCHIVED (1 cái): được tạo thêm; đủ 2 cái thì đạt giới hạn tổng', () => {
    expect(workspaceCreation({ ...NONE, workspaces: [ws('a', 'OWNER', 'ARCHIVED')] })).toEqual({ kind: 'ALLOWED', viaApplication: false });
    expect(workspaceCreation({ ...NONE, workspaces: [ws('a', 'OWNER', 'ARCHIVED'), ws('b', 'OWNER', 'ARCHIVED')] }).kind).toBe('LIMIT_TOTAL');
  });
  it('chỉ là MANAGER/STAFF của workspace người khác: vẫn cần đơn được duyệt mới tạo', () => {
    expect(workspaceCreation({ ...NONE, workspaces: [ws('x', 'STAFF')] }).kind).toBe('NEEDS_APPLICATION');
    expect(workspaceCreation({ ...NONE, workspaces: [ws('x', 'MANAGER')], landlordApplication: app('APPROVED') }).kind).toBe('ALLOWED');
    expect(workspaceCreation({ ...NONE, workspaces: [ws('x', 'MANAGER')], landlordApplication: app('PENDING') }).kind).toBe('APPLICATION_PENDING');
  });
  it('thông báo lỗi tạo workspace', () => {
    const e = (statusCode: number, code: string) => new ApiError({ statusCode, code, message: 'raw' });
    expect(creationErrorMessage(e(409, 'WORKSPACE_ACTIVE_LIMIT_REACHED'))).toContain('giới hạn');
    expect(creationErrorMessage(e(403, 'LANDLORD_APPLICATION_REQUIRED'))).toContain('đã được duyệt');
    expect(creationErrorMessage(e(403, 'SOMETHING_ELSE'))).toBe('Bạn không có quyền tạo workspace.');
    expect(creationErrorMessage(e(500, 'X'))).toBe('raw');
  });
});

// ------------ trang chọn/tạo workspace với backend giả bằng fetch (adapter thật chạy)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user: AuthUserResponse = { id: 'u1', email: 'a@b.test', displayName: 'A B', status: 'ACTIVE', createdAt: '2026-10-15T00:00:00.000Z' };

interface Backend {
  caps: UserCapabilitiesResponse;
  capsStatus?: number;
  /** Trả lời cho POST /workspaces. */
  create?: (body: { name: string }) => Response;
}
function stub(backend: Backend) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace(/^.*\/api\/v1/, '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: path, method: String(init.method), body });
      if (path === '/auth/refresh') return json(200, { accessToken: 't', expiresIn: 600, user });
      if (path === '/auth/me') return json(200, user);
      if (path === '/users/me/capabilities')
        return (backend.capsStatus ?? 200) === 200 ? json(200, backend.caps) : json(backend.capsStatus!, { statusCode: backend.capsStatus, code: 'INTERNAL_ERROR', message: 'boom' });
      if (path === '/workspaces' && init.method === 'POST') return backend.create!(body);
      return json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'x' });
    }),
  );
  return calls;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/workspaces/select']}>
          <Routes>
            <Route path="/workspaces/select" element={<WorkspaceSelectPage />} />
            <Route path="/w/:id/dashboard" element={<div>DASHBOARD-OF-NEW-WORKSPACE</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}

const created = (id: string) => ({ id, name: 'Nhà trọ mới', status: 'ACTIVE', archivedAt: null, createdAt: '', updatedAt: '', currentMembership: { role: 'OWNER' } });

describe('trang chọn / tạo workspace', () => {
  beforeEach(() => {
    accessTokenStore.clear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('user thường: thấy hướng dẫn đăng ký chủ trọ, KHÔNG có form tạo workspace', async () => {
    stub({ caps: NONE });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Gửi đơn đăng ký' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tạo workspace/ })).toBeNull();
    expect(screen.queryByLabelText(/Tên workspace/)).toBeNull();
  });

  it('đơn đang chờ duyệt: hiện trạng thái, không cho tạo', async () => {
    stub({ caps: { ...NONE, landlordApplication: app('PENDING') } });
    renderPage();
    expect(await screen.findByText('Đang chờ duyệt')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên workspace/)).toBeNull();
  });

  it('đơn bị từ chối: hiện lý do và cho nộp lại, không cho tạo', async () => {
    stub({ caps: { ...NONE, landlordApplication: app('REJECTED', { decisionNote: 'Thiếu giấy tờ' }) } });
    renderPage();
    expect(await screen.findByText(/Thiếu giấy tờ/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên workspace/)).toBeNull();
  });

  it('đơn APPROVED chưa có workspace: tạo qua API thật, lấy lại quyền rồi vào workspace mới', async () => {
    const caps: { current: UserCapabilitiesResponse } = { current: { ...NONE, landlordApplication: app('APPROVED') } };
    const calls = stub({
      caps: NONE,
      create: () => {
        caps.current = { ...caps.current, workspaces: [ws('new-ws-1')] };
        return json(201, created('new-ws-1'));
      },
    });
    // capabilities đọc từ biến thay đổi được: trước khi tạo chưa có workspace, sau khi tạo có
    const base = globalThis.fetch as unknown as (url: string, init: RequestInit) => Promise<Response>;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => (url.endsWith('/users/me/capabilities') ? json(200, caps.current) : base(url, init))));
    renderPage();
    const input = await screen.findByLabelText(/Tên workspace/);
    expect(screen.getByText('Đã được duyệt')).toBeInTheDocument();
    await userEvent.type(input, '  Nhà trọ mới  ');
    await userEvent.click(screen.getByRole('button', { name: /Tạo workspace/ }));
    expect(await screen.findByText('DASHBOARD-OF-NEW-WORKSPACE')).toBeInTheDocument();
    const post = calls.find((c) => c.url === '/workspaces' && c.method === 'POST')!;
    expect(post.body).toEqual({ name: 'Nhà trọ mới' });
    expect(localStorage.getItem('rp.lastWorkspaceId')).toBe('new-ws-1');
  });

  it('tên trống: chặn ở client, không gọi API', async () => {
    const calls = stub({ caps: { ...NONE, landlordApplication: app('APPROVED') }, create: () => json(201, created('x')) });
    renderPage();
    await screen.findByLabelText(/Tên workspace/);
    await userEvent.click(screen.getByRole('button', { name: /Tạo workspace/ }));
    expect(await screen.findByText('Vui lòng nhập tên workspace')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST' && c.url === '/workspaces')).toBe(false);
  });

  it('409 WORKSPACE_ACTIVE_LIMIT_REACHED: hiện thông báo giới hạn, ở lại trang', async () => {
    stub({
      caps: { ...NONE, landlordApplication: app('APPROVED') },
      create: () => json(409, { statusCode: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED', message: 'limit' }),
    });
    renderPage();
    await userEvent.type(await screen.findByLabelText(/Tên workspace/), 'Nhà trọ B');
    await userEvent.click(screen.getByRole('button', { name: /Tạo workspace/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('giới hạn workspace');
    expect(screen.queryByText('DASHBOARD-OF-NEW-WORKSPACE')).toBeNull();
  });

  it('403 LANDLORD_APPLICATION_REQUIRED: hiện thông báo và lấy lại quyền', async () => {
    const calls = stub({
      caps: { ...NONE, landlordApplication: app('APPROVED') },
      create: () => json(403, { statusCode: 403, code: 'LANDLORD_APPLICATION_REQUIRED', message: 'x' }),
    });
    renderPage();
    await userEvent.type(await screen.findByLabelText(/Tên workspace/), 'Nhà trọ C');
    await userEvent.click(screen.getByRole('button', { name: /Tạo workspace/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('đã được duyệt');
    await waitFor(() => expect(calls.filter((c) => c.url === '/users/me/capabilities').length).toBeGreaterThanOrEqual(2));
  });

  it('OWNER có workspace ACTIVE: thấy danh sách, KHÔNG có form tạo, có giải thích giới hạn', async () => {
    stub({ caps: { ...NONE, workspaces: [ws('w1')] } });
    renderPage();
    expect(await screen.findByText('Nhà trọ w1')).toBeInTheDocument();
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument();
    expect(screen.getByText(/chỉ có một workspace đang hoạt động/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên workspace/)).toBeNull();
  });

  it('phân biệt ACTIVE và ARCHIVED; OWNER chỉ còn workspace đã lưu trữ thì được tạo mới', async () => {
    stub({ caps: { ...NONE, workspaces: [ws('old', 'OWNER', 'ARCHIVED'), ws('mgr', 'MANAGER')] } });
    renderPage();
    expect(await screen.findByText('Nhà trọ old')).toBeInTheDocument();
    expect(screen.getByText('Đã lưu trữ')).toBeInTheDocument();
    // V1: workspace MANAGER cũ không hiển thị như quyền chủ trọ
    expect(screen.queryByText('Nhà trọ mgr')).toBeNull();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
    expect(screen.getByText(/chỉ xem, không ghi thêm dữ liệu/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Tên workspace/)).toBeInTheDocument();
  });

  it('lỗi tải quyền: hiện lỗi + Thử lại, không hiện form tạo', async () => {
    stub({ caps: NONE, capsStatus: 500 });
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Tên workspace/)).toBeNull();
  });

  it('đang tải: hiện trạng thái loading trước khi có dữ liệu', async () => {
    stub({ caps: NONE });
    renderPage();
    expect(screen.queryByRole('button', { name: 'Gửi đơn đăng ký' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Gửi đơn đăng ký' })).toBeInTheDocument();
  });
});

describe('mock mode: workspacesMock.create phản chiếu luật backend', () => {
  const record = mockUsers.find((r) => r.user.email === 'minh@demo.vn')!;
  beforeEach(() => {
    mockSession.set(record.user.id);
    mockLandlordApplications.clear();
  });
  afterEach(() => {
    record.memberships.length = 0;
    mockLandlordApplications.clear();
    mockSession.clear();
  });

  it('chưa được duyệt → 403 LANDLORD_APPLICATION_REQUIRED', async () => {
    await expect(workspacesMock.create('X')).rejects.toMatchObject({ status: 403, code: 'LANDLORD_APPLICATION_REQUIRED' });
  });
  it('APPROVED → tạo OWNER ACTIVE; lần thứ hai → 409 giới hạn', async () => {
    mockLandlordApplications.set(record.user.id, app('APPROVED'));
    const m = await workspacesMock.create('  Nhà trọ mock  ');
    expect(m).toMatchObject({ name: 'Nhà trọ mock', role: 'OWNER', status: 'ACTIVE' });
    await expect(workspacesMock.create('Y')).rejects.toMatchObject({ status: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED' });
  });
});
