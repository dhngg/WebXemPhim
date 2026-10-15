import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUserResponse, UserCapabilitiesResponse } from '@rental/shared';
import { createQueryClient } from '@/app/queryClient';
import { GuestOnly, RequireArea, RequireAuth } from '@/app/guards';
import { useAppRole } from '@/features/auth/role';
import { toMembershipFromWorkspace } from '@/features/workspaces/api';
import { useMyWorkspaces } from '@/features/workspaces/hooks';
import { LandlordApplicationCard } from '@/pages/user/LandlordApplicationCard';
import { ToastProvider } from '@/components/ui';
import { accessTokenStore } from '@/services/http/accessToken';
import { ApiError } from '@/services/http/ApiError';
import { applyV1Policy, areasOf, homeFor, pickWorkspace } from './model';

const NONE: UserCapabilitiesResponse = { workspaces: [], tenantLinks: [], isPlatformAdmin: false, landlordApplication: null };
const ws = (id: string, role: 'OWNER' | 'MANAGER' | 'STAFF' = 'OWNER', status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') => ({
  id,
  name: `WS ${id}`,
  status,
  role,
});
const link = { tenantId: 't1', workspaceId: 'w1', tenantName: 'Nam', workspaceName: 'WS w1' };

const OWNER = { ...NONE, workspaces: [ws('w1')] };
const TENANT = { ...NONE, tenantLinks: [link] };
const ADMIN = { ...NONE, isPlatformAdmin: true };
const MULTI: UserCapabilitiesResponse = {
  workspaces: [ws('w1', 'OWNER'), ws('w2', 'STAFF')],
  tenantLinks: [link],
  isPlatformAdmin: true,
  landlordApplication: null,
};

describe('model: quyền thật → khu vực và trang chủ', () => {
  it('khách và user thường chỉ có khu tìm trọ', () => {
    expect(areasOf(null)).toEqual(['market']);
    expect(areasOf(NONE)).toEqual(['market']);
    expect(homeFor(null)).toBe('/');
    expect(homeFor(NONE)).toBe('/');
  });
  it('chủ trọ: khu chủ trọ, trang chủ là workspace', () => {
    expect(areasOf(OWNER)).toEqual(['market', 'landlord']);
    expect(homeFor(OWNER)).toBe('/w/w1/dashboard');
  });
  it('người thuê có liên kết → /tenant; admin → /admin', () => {
    expect(areasOf(TENANT)).toEqual(['market', 'tenant']);
    expect(homeFor(TENANT)).toBe('/tenant');
    expect(areasOf(ADMIN)).toEqual(['market', 'admin']);
    expect(homeFor(ADMIN)).toBe('/admin');
  });
  it('nhiều vai trò cùng lúc: có đủ mọi khu vực, ưu tiên admin > chủ trọ > người thuê', () => {
    expect(areasOf(MULTI)).toEqual(['market', 'landlord', 'tenant', 'admin']);
    expect(homeFor(MULTI)).toBe('/admin');
    expect(homeFor({ ...MULTI, isPlatformAdmin: false })).toBe('/w/w1/dashboard');
    expect(homeFor({ ...MULTI, isPlatformAdmin: false, workspaces: [] })).toBe('/tenant');
  });
  it('nhiều workspace: dùng workspace gần nhất CHỈ khi vẫn còn là thành viên', () => {
    const caps = { ...NONE, workspaces: [ws('a', 'OWNER', 'ARCHIVED'), ws('b', 'MANAGER'), ws('c', 'STAFF')] };
    expect(pickWorkspace(caps, 'c')?.id).toBe('c');
    expect(pickWorkspace(caps, 'đã-bị-gỡ')?.id).toBe('b'); // id cũ trong localStorage không còn quyền → bỏ qua
    expect(homeFor(caps, 'forged')).toBe('/w/b/dashboard');
    expect(homeFor({ ...NONE, workspaces: [ws('a', 'OWNER', 'ARCHIVED')] })).toBe('/w/a/dashboard');
  });
  it('V1: MANAGER/STAFF không mở khu chủ trọ; OWNER, tenant, admin giữ nguyên', () => {
    const legacy = { ...NONE, workspaces: [ws('m', 'MANAGER'), ws('s', 'STAFF')] };
    expect(areasOf(applyV1Policy(legacy))).toEqual(['market']);
    expect(homeFor(applyV1Policy(legacy), 'm')).toBe('/');
    // Nhiều vai trò: workspace OWNER còn, workspace MANAGER mất; tenant/admin không đổi
    const multi = applyV1Policy({ ...NONE, workspaces: [ws('o'), ws('m', 'MANAGER')], tenantLinks: [link], isPlatformAdmin: true });
    expect(multi.workspaces.map((w) => w.id)).toEqual(['o']);
    expect(areasOf(multi)).toEqual(['market', 'landlord', 'tenant', 'admin']);
    expect(areasOf(applyV1Policy({ ...TENANT, workspaces: [ws('s', 'STAFF')] }))).toEqual(['market', 'tenant']);
    expect(areasOf(applyV1Policy(ADMIN))).toEqual(['market', 'admin']);
  });
  it('không suy quyền từ localStorage: user thường có workspace id lưu sẵn vẫn về "/"', () => {
    expect(homeFor(NONE, 'w1')).toBe('/');
  });
});

// ---------- dựng backend giả bằng fetch (adapter thật chạy, mock mode tắt)
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user: AuthUserResponse = { id: 'u1', email: 'a@b.test', displayName: 'A B', status: 'ACTIVE', createdAt: '2026-10-15T00:00:00.000Z' };

interface Backend {
  session?: boolean;
  caps?: UserCapabilitiesResponse;
  capsStatus?: number;
}
function stubBackend({ session = true, caps = NONE, capsStatus = 200 }: Backend) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = url.replace(/^.*\/api\/v1/, '');
      calls.push({ url: path, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (path === '/auth/refresh') return session ? json(200, { accessToken: 't', expiresIn: 600, user }) : json(401, { statusCode: 401, code: 'REFRESH_TOKEN_INVALID', message: 'x' });
      if (path === '/auth/me') return json(200, user);
      if (path === '/users/me/capabilities')
        return capsStatus === 200 ? json(200, caps) : json(capsStatus, { statusCode: capsStatus, code: 'INTERNAL_ERROR', message: 'boom' });
      if (path === '/landlord-applications/me') return json(201, { ...caps.landlordApplication, id: 'new', status: 'PENDING' });
      return json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'x' });
    }),
  );
  return calls;
}

function Where() {
  const l = useLocation();
  return <span data-testid="where">{l.pathname}</span>;
}

function AppUnderTest() {
  return (
    <>
      <Where />
      <Routes>
        <Route path="/" element={<div>MARKET</div>} />
        <Route path="/login" element={<GuestOnly><div>LOGIN</div></GuestOnly>} />
        <Route element={<RequireAuth />}>
          <Route path="/admin" element={<RequireArea area="admin"><div>ADMIN-AREA</div></RequireArea>} />
          <Route path="/w/:workspaceId/dashboard" element={<RequireArea area="landlord"><div>LANDLORD-AREA</div></RequireArea>} />
          <Route path="/tenant" element={<RequireArea area="tenant"><div>TENANT-AREA</div></RequireArea>} />
        </Route>
      </Routes>
    </>
  );
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AppUnderTest />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const where = () => screen.getByTestId('where').textContent;

describe('route guards theo quyền thật từ /users/me/capabilities', () => {
  beforeEach(() => {
    accessTokenStore.clear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('khách chưa đăng nhập: vào khu quản trị bị đưa tới /login', async () => {
    const calls = stubBackend({ session: false });
    renderAt('/admin');
    expect(await screen.findByText('LOGIN')).toBeInTheDocument();
    expect(calls.some((c) => c.url === '/users/me/capabilities')).toBe(false); // khách không gọi capabilities
  });

  it('user thường: không vào được admin / chủ trọ / người thuê, về trang công khai', async () => {
    stubBackend({ caps: NONE });
    for (const path of ['/admin', '/w/w1/dashboard', '/tenant']) {
      const { unmount } = renderAt(path);
      await waitFor(() => expect(where()).toBe('/'));
      expect(screen.queryByText(/-AREA/)).toBeNull();
      unmount();
    }
  });

  it('owner: vào workspace của mình; admin/tenant bị đưa về workspace', async () => {
    stubBackend({ caps: OWNER });
    renderAt('/w/w1/dashboard');
    expect(await screen.findByText('LANDLORD-AREA')).toBeInTheDocument();
  });
  it('owner mở /admin → về dashboard workspace, không thấy giao diện admin', async () => {
    stubBackend({ caps: OWNER });
    renderAt('/admin');
    await waitFor(() => expect(where()).toBe('/w/w1/dashboard'));
    expect(screen.queryByText('ADMIN-AREA')).toBeNull();
  });

  it('tenant có liên kết: vào /tenant; mở khu chủ trọ/admin thì về /tenant', async () => {
    stubBackend({ caps: TENANT });
    renderAt('/tenant');
    expect(await screen.findByText('TENANT-AREA')).toBeInTheDocument();
  });
  it('tenant mở /admin → về /tenant', async () => {
    stubBackend({ caps: TENANT });
    renderAt('/admin');
    await waitFor(() => expect(where()).toBe('/tenant'));
  });

  it('admin: vào /admin; mở workspace không thuộc mình thì về /admin', async () => {
    stubBackend({ caps: ADMIN });
    renderAt('/admin');
    expect(await screen.findByText('ADMIN-AREA')).toBeInTheDocument();
  });
  it('admin không phải thành viên workspace → /w/... bị đưa về /admin', async () => {
    stubBackend({ caps: ADMIN });
    renderAt('/w/w9/dashboard');
    await waitFor(() => expect(where()).toBe('/admin'));
  });

  it('đa vai trò (admin + chủ trọ 2 workspace + người thuê): vào được cả ba khu vực', async () => {
    stubBackend({ caps: MULTI });
    for (const [path, text] of [['/admin', 'ADMIN-AREA'], ['/w/w2/dashboard', 'LANDLORD-AREA'], ['/tenant', 'TENANT-AREA']] as const) {
      const { unmount } = renderAt(path);
      expect(await screen.findByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it('đã đăng nhập vào /login được chuyển tới trang chủ theo quyền (admin trước)', async () => {
    stubBackend({ caps: MULTI });
    renderAt('/login');
    await waitFor(() => expect(where()).toBe('/admin'));
  });

  it('lỗi tải quyền: hiển thị lỗi + thử lại, KHÔNG coi như không có quyền hay cho vào', async () => {
    stubBackend({ capsStatus: 500 });
    renderAt('/admin');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN-AREA')).toBeNull();
    expect(where()).toBe('/admin'); // không bị chuyển hướng sai
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });

  it('nhiều component dùng chung một lần gọi capabilities', async () => {
    const calls = stubBackend({ caps: OWNER });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAppRole(), { wrapper });
    await waitFor(() => expect(result.current.has('landlord')).toBe(true));
    expect(calls.filter((c) => c.url === '/users/me/capabilities')).toHaveLength(1);
  });
});

describe('quyền đổi sau khi đã đăng nhập', () => {
  beforeEach(() => {
    accessTokenStore.clear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('bị gỡ khỏi workspace: khi quyền được lấy lại, user đang ở khu chủ trọ bị đưa ra ngoài', async () => {
    let caps: UserCapabilitiesResponse = OWNER;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = url.replace(/^.*\/api\/v1/, '');
        if (path === '/auth/refresh') return json(200, { accessToken: 't', expiresIn: 600, user });
        if (path === '/auth/me') return json(200, user);
        return json(200, caps);
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/w/w1/dashboard']}>
          <AppUnderTest />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('LANDLORD-AREA')).toBeInTheDocument();
    caps = NONE; // owner của workspace đã gỡ user này
    await qc.invalidateQueries({ queryKey: ['capabilities'] });
    await waitFor(() => expect(where()).toBe('/'));
    expect(screen.queryByText('LANDLORD-AREA')).toBeNull();
  });

  it('được cấp thêm quyền (admin duyệt đơn): khu chủ trọ mở ra sau khi lấy lại quyền', async () => {
    let caps: UserCapabilitiesResponse = NONE;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const path = url.replace(/^.*\/api\/v1/, '');
        if (path === '/auth/refresh') return json(200, { accessToken: 't', expiresIn: 600, user });
        if (path === '/auth/me') return json(200, user);
        return json(200, caps);
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Probe() {
      const { has } = useAppRole();
      return <span data-testid="landlord">{String(has('landlord'))}</span>;
    }
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('landlord').textContent).toBe('false'));
    caps = OWNER;
    await qc.invalidateQueries({ queryKey: ['capabilities'] });
    await waitFor(() => expect(screen.getByTestId('landlord').textContent).toBe('true'));
  });
});

describe('useAppRole / useMyWorkspaces', () => {
  beforeEach(() => {
    accessTokenStore.clear();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  );

  it('có trạng thái loading rồi dữ liệu; areas theo thứ tự cố định', async () => {
    stubBackend({ caps: MULTI });
    const { result } = renderHook(() => useAppRole(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.areas).toEqual(['market', 'landlord', 'tenant', 'admin']);
    expect(result.current.capabilities?.workspaces).toHaveLength(1); // w2 (STAFF) bị loại theo chính sách V1
  });

  it('khách: isGuest, chỉ khu công khai, không gọi capabilities', async () => {
    const calls = stubBackend({ session: false });
    const { result } = renderHook(() => useAppRole(), { wrapper });
    await waitFor(() => expect(result.current.isGuest).toBe(true));
    expect(result.current.areas).toEqual(['market']);
    expect(calls.some((c) => c.url === '/users/me/capabilities')).toBe(false);
  });

  it('danh sách workspace lấy từ capabilities, không gọi /workspaces/me (404)', async () => {
    const calls = stubBackend({ caps: MULTI });
    const { result } = renderHook(() => ({ role: useAppRole(), list: useMyWorkspaces() }), { wrapper });
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    expect(result.current.list.data?.map((m) => [m.workspaceId, m.role])).toEqual([['w1', 'OWNER']]);
    expect(calls.some((c) => c.url.includes('/workspaces'))).toBe(false);
  });

  it('GET /workspaces của backend được ánh xạ sang membership', () => {
    expect(
      toMembershipFromWorkspace({ id: 'w', name: 'N', status: 'ACTIVE', archivedAt: null, createdAt: '', updatedAt: '', currentMembership: { role: 'MANAGER' } }),
    ).toEqual({ workspaceId: 'w', name: 'N', status: 'ACTIVE', role: 'MANAGER' });
  });
});

describe('403 → lấy lại quyền', () => {
  it('một request nghiệp vụ bị 403 làm quyền đang giữ bị đánh dấu cũ để lấy lại', async () => {
    const client = createQueryClient();
    client.setQueryData(['capabilities'], OWNER);
    await client
      .fetchQuery({
        queryKey: ['workspaces', 'w1', 'buildings'],
        queryFn: () => Promise.reject(new ApiError({ statusCode: 403, code: 'WORKSPACE_NOT_FOUND', message: 'x' })),
        retry: false,
      })
      .catch(() => undefined);
    expect(client.getQueryState(['capabilities'])?.isInvalidated).toBe(true);
  });
  it('404 WORKSPACE_NOT_FOUND (không còn là thành viên) cũng làm lấy lại quyền', async () => {
    const client = createQueryClient();
    client.setQueryData(['capabilities'], OWNER);
    await client
      .fetchQuery({
        queryKey: ['workspaces', 'w1', 'dashboard'],
        queryFn: () => Promise.reject(new ApiError({ statusCode: 404, code: 'WORKSPACE_NOT_FOUND', message: 'x' })),
        retry: false,
      })
      .catch(() => undefined);
    expect(client.getQueryState(['capabilities'])?.isInvalidated).toBe(true);
  });
  it('ACCOUNT_DISABLED và lỗi của chính capabilities/auth không gây vòng lặp lấy lại', async () => {
    const client = createQueryClient();
    client.setQueryData(['capabilities'], OWNER);
    await client
      .fetchQuery({ queryKey: ['x'], queryFn: () => Promise.reject(new ApiError({ statusCode: 403, code: 'ACCOUNT_DISABLED', message: 'x' })), retry: false })
      .catch(() => undefined);
    expect(client.getQueryState(['capabilities'])?.isInvalidated).toBe(false);
  });
});

describe('đơn đăng ký chủ trọ (landlord application)', () => {
  beforeEach(() => accessTokenStore.clear());
  afterEach(() => vi.unstubAllGlobals());
  const application = (status: 'PENDING' | 'APPROVED' | 'REJECTED', extra = {}) => ({
    id: 'la1',
    status,
    reason: 'Tôi có 12 phòng trọ',
    decisionNote: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-10T00:00:00.000Z',
    ...extra,
  });
  const renderCard = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <MemoryRouter>
            <LandlordApplicationCard />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );

  it('chưa có đơn: hiện form và gửi POST /landlord-applications/me chỉ với { reason }', async () => {
    const calls = stubBackend({ caps: NONE });
    renderCard();
    const box = await screen.findByLabelText(/Lý do/);
    await userEvent.type(box, '  Tôi muốn quản lý 8 phòng  ');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đơn đăng ký' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/landlord-applications/me')).toBe(true));
    const post = calls.find((c) => c.url === '/landlord-applications/me')!;
    expect(post.method).toBe('POST');
    expect(post.body).toEqual({ reason: 'Tôi muốn quản lý 8 phòng' });
  });

  it('đơn đang chờ: hiện trạng thái, không cho gửi thêm', async () => {
    stubBackend({ caps: { ...NONE, landlordApplication: application('PENDING') } });
    renderCard();
    expect(await screen.findByText('Đang chờ duyệt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi đơn đăng ký' })).toBeNull();
  });

  it('bị từ chối: hiện lý do của admin và cho gửi lại', async () => {
    stubBackend({ caps: { ...NONE, landlordApplication: application('REJECTED', { decisionNote: 'Thiếu giấy tờ', decidedAt: '2026-10-11T00:00:00.000Z' }) } });
    renderCard();
    expect(await screen.findByText('Bị từ chối')).toBeInTheDocument();
    expect(screen.getByText(/Thiếu giấy tờ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi đơn đăng ký' })).toBeInTheDocument();
  });

  it('đã duyệt: hiện trạng thái và hướng tới việc tạo workspace, không cho nộp đơn mới', async () => {
    stubBackend({ caps: { ...NONE, landlordApplication: application('APPROVED', { decidedAt: '2026-10-11T00:00:00.000Z' }) } });
    renderCard();
    expect(await screen.findByText('Đã được duyệt')).toBeInTheDocument();
    expect(screen.getAllByText(/tạo workspace/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Gửi đơn đăng ký' })).toBeNull();
  });
});
