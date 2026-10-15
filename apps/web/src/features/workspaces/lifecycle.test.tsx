import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LandlordApplicationResponse, UserCapabilitiesResponse, WorkspaceResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const ctl = vi.hoisted(() => ({ record: null as unknown }));
vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => ctl.record, currentMockUser: () => null }));

import { ToastProvider } from '@/components/ui';
import { WorkspaceSelectPage } from '@/pages/user/UserPages';
import { workspacesMock } from '@/mocks/handlers/workspaces.mock';
import { ApiError } from '@/services/http/ApiError';
import { workspacesHttp } from './api';
import { lifecycleErrorMessage } from './creation';
import apiSource from './api.ts?raw';
import cardSource from '../../pages/user/LandlordApplicationCard.tsx?raw';
import sectionSource from '../../pages/user/WorkspaceCreationSection.tsx?raw';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const W1 = '11111111-1111-4111-8111-111111111111';
const W2 = '22222222-2222-4222-8222-222222222222';
const wsDto = (id: string, status: 'ACTIVE' | 'ARCHIVED'): WorkspaceResponse => ({
  id, name: `Nhà trọ ${id.slice(0, 2)}`, status, archivedAt: status === 'ARCHIVED' ? '2026-10-10T00:00:00.000Z' : null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', currentMembership: { role: 'OWNER' },
});
const app = (status: LandlordApplicationResponse['status']): LandlordApplicationResponse => ({
  id: 'la', status, reason: 'Tôi có 10 phòng', decisionNote: null, decidedByUserId: null, decidedAt: status === 'PENDING' ? null : '2026-10-11T00:00:00.000Z', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z',
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('HTTP adapter', () => {
  it('archive/restore là PATCH /workspaces/:id/archive|restore, không thân, trả membership', async () => {
    http.patch.mockResolvedValue(wsDto(W1, 'ARCHIVED'));
    expect(await workspacesHttp.archive(W1)).toEqual({ workspaceId: W1, name: 'Nhà trọ 11', status: 'ARCHIVED', role: 'OWNER' });
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${W1}/archive`);
    http.patch.mockResolvedValue(wsDto(W1, 'ACTIVE'));
    expect((await workspacesHttp.restore(W1)).status).toBe('ACTIVE');
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${W1}/restore`);
  });
  it('không có xóa workspace và không tạo vai trò MANAGER/STAFF', () => {
    expect(strip(apiSource)).not.toMatch(/httpClient\.delete|MANAGER|STAFF/);
    expect(strip(cardSource + sectionSource)).not.toMatch(/MANAGER|STAFF|quản lý\/nhân viên|mời bạn làm/);
  });
  it('thông báo lỗi lưu trữ/khôi phục theo mã backend', () => {
    const e = (statusCode: number, code?: string) => new ApiError({ statusCode, code, message: 'raw' });
    expect(lifecycleErrorMessage(e(409, 'WORKSPACE_ACTIVE_LIMIT_REACHED'), 'restore')).toMatch(/đã có một workspace đang hoạt động/);
    expect(lifecycleErrorMessage(e(404, 'WORKSPACE_NOT_FOUND'), 'archive')).toMatch(/không phải chủ trọ/);
    expect(lifecycleErrorMessage(e(403), 'archive')).toMatch(/lưu trữ/);
    expect(lifecycleErrorMessage(e(403), 'restore')).toMatch(/khôi phục/);
    expect(lifecycleErrorMessage(e(500), 'archive')).toBe('raw');
  });
});

describe('mock theo đúng backend', () => {
  const as = (memberships: unknown[]) => {
    ctl.record = { user: { id: 'u', fullName: 'U', email: 'u@x.vn', phone: '', globalRole: 'USER' }, memberships };
  };
  const m = (id: string, status: 'ACTIVE' | 'ARCHIVED', role = 'OWNER') => ({ workspaceId: id, name: id, status, role });

  it('lưu trữ giữ nguyên workspace (không xóa), lặp lại là idempotent; người không phải OWNER bị 404', async () => {
    as([m('a', 'ACTIVE'), m('s', 'ACTIVE', 'MANAGER')]);
    expect(await workspacesMock.archive('a')).toMatchObject({ workspaceId: 'a', status: 'ARCHIVED' });
    expect(await workspacesMock.archive('a')).toMatchObject({ status: 'ARCHIVED' });
    expect((await workspacesMock.listMine()).map((x) => x.workspaceId)).toEqual(['a']); // vẫn còn, chỉ đổi trạng thái; MANAGER bị loại theo V1
    await expect(workspacesMock.archive('s')).rejects.toMatchObject({ status: 404, code: 'WORKSPACE_NOT_FOUND' });
    await expect(workspacesMock.restore('khong-co')).rejects.toMatchObject({ status: 404 });
  });
  it('khôi phục bị 409 khi đã có workspace ACTIVE khác; khôi phục được khi không còn', async () => {
    as([m('a', 'ARCHIVED'), m('b', 'ACTIVE')]);
    await expect(workspacesMock.restore('a')).rejects.toMatchObject({ status: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED' });
    await workspacesMock.archive('b');
    expect(await workspacesMock.restore('a')).toMatchObject({ workspaceId: 'a', status: 'ACTIVE' });
    expect(await workspacesMock.restore('a')).toMatchObject({ status: 'ACTIVE' }); // idempotent
  });
  it('không tự lưu trữ workspace cũ khi tạo workspace mới: đang ACTIVE thì tạo bị 409', async () => {
    as([m('a', 'ACTIVE')]);
    await expect(workspacesMock.create('Mới')).rejects.toMatchObject({ status: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED' });
    expect((await workspacesMock.listMine())[0]!.status).toBe('ACTIVE');
  });
});

// ===================================================================== Trang chọn workspace
function caps(workspaces: Array<[string, 'ACTIVE' | 'ARCHIVED']>, application: LandlordApplicationResponse | null = null): UserCapabilitiesResponse {
  return { workspaces: workspaces.map(([id, status]) => ({ id, name: `Nhà trọ ${id.slice(0, 2)}`, status, role: 'OWNER' as const })), tenantLinks: [], isPlatformAdmin: false, landlordApplication: application };
}
function serveCaps(value: () => UserCapabilitiesResponse) {
  http.get.mockImplementation(async (url: string) => {
    if (url === '/users/me/capabilities') return value();
    throw new Error(`unrouted ${url}`);
  });
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <WorkspaceSelectPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const capsCalls = () => http.get.mock.calls.filter((c) => c[0] === '/users/me/capabilities').length;

describe('trang chọn workspace: lưu trữ / khôi phục', () => {
  it('workspace ACTIVE có nút Lưu trữ với xác nhận rõ (không phải xóa); hủy thì không gọi API', async () => {
    serveCaps(() => caps([[W1, 'ACTIVE']]));
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu trữ workspace' }));
    const dlg = await screen.findByRole('alertdialog');
    expect(within(dlg).getByText(/Đây không phải xóa workspace/)).toBeTruthy();
    expect(within(dlg).getByText(/chỉ xem/)).toBeTruthy();
    await userEvent.click(within(dlg).getByRole('button', { name: 'Hủy' }));
    expect(http.patch).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Khôi phục workspace' })).toBeNull();
  });

  it('xác nhận lưu trữ → PATCH /archive rồi lấy lại quyền (capabilities) và đổi nút thành Khôi phục', async () => {
    let status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
    serveCaps(() => caps([[W1, status]]));
    http.patch.mockImplementation(async () => {
      status = 'ARCHIVED';
      return wsDto(W1, 'ARCHIVED');
    });
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Lưu trữ workspace' }));
    const before = capsCalls();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Lưu trữ' }));
    await waitFor(() => expect(http.patch).toHaveBeenCalledWith(`/workspaces/${W1}/archive`));
    expect(await screen.findByText('Đã lưu trữ workspace.')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Khôi phục workspace' })).toBeTruthy();
    expect(capsCalls()).toBeGreaterThan(before);
  });

  it('khôi phục bị 409 (đã có workspace ACTIVE khác): hiện lý do, trạng thái thật được lấy lại', async () => {
    serveCaps(() => caps([[W1, 'ARCHIVED'], [W2, 'ACTIVE']]));
    http.patch.mockRejectedValue(new ApiError({ statusCode: 409, code: 'WORKSPACE_ACTIVE_LIMIT_REACHED', message: 'raw' }));
    mount();
    const card = (await screen.findAllByTestId(/^workspace-/)).find((c) => within(c).queryByRole('button', { name: 'Khôi phục workspace' }))!;
    await userEvent.click(within(card).getByRole('button', { name: 'Khôi phục workspace' }));
    const before = capsCalls();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Khôi phục' }));
    await waitFor(() => expect(http.patch).toHaveBeenCalledWith(`/workspaces/${W1}/restore`));
    expect(await screen.findByText(/Không khôi phục được: bạn đã có một workspace đang hoạt động/)).toBeTruthy();
    await waitFor(() => expect(capsCalls()).toBeGreaterThan(before));
  });

  it('vai trò MANAGER/STAFF (dữ liệu cũ) bị loại khỏi V1 nên không có workspace và không có nút', async () => {
    serveCaps(() => ({ ...caps([]), workspaces: [{ id: W1, name: 'Cũ', status: 'ACTIVE', role: 'MANAGER' }] }));
    mount();
    expect(await screen.findByText('Đăng ký làm chủ trọ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lưu trữ workspace|Khôi phục workspace/ })).toBeNull();
  });
});

describe('onboarding: nội dung đúng chính sách V1', () => {
  it('đơn chờ duyệt: giải thích được duyệt = quyền tạo workspace đầu tiên, hệ thống không tự tạo; không mời quản lý/nhân viên', async () => {
    serveCaps(() => caps([], app('PENDING')));
    mount();
    expect(await screen.findByText(/hệ thống không tự tạo workspace/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/quản lý\/nhân viên|mời bạn làm|quyền chủ trọ sẽ tự xuất hiện/);
    expect(document.body.textContent).toMatch(/được phép tạo\s*workspace đầu tiên/);
  });
  it('đơn đã duyệt: nói rõ chỉ mở quyền tạo workspace và có form tạo', async () => {
    serveCaps(() => caps([], app('APPROVED')));
    mount();
    expect(await screen.findByText(/Bạn đã có quyền tạo workspace đầu\s*tiên/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo workspace/ })).toBeTruthy();
    expect(document.body.textContent).toMatch(/trở thành chủ trọ \(OWNER\)/);
  });
});
