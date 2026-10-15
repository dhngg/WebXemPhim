import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewingRequestResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const ctl = vi.hoisted(() => ({ record: null as unknown, empty: false }));
vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: ctl.empty }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => ctl.record, currentMockUser: () => null }));

import { ToastProvider } from '@/components/ui';
import { db } from '@/mocks/db';
import { addViewingRequest, findViewingRequest, viewingsOwnerMock } from '@/mocks/handlers/viewing-requests.mock';
import { ApiError } from '@/services/http/ApiError';
import { ViewingRequestsPage } from '@/pages/workspace/ViewingPages';
import { viewingsOwnerHttp } from './owner-api';
import { PAGE_SIZE, canDecideViewing, decisionSchema, ownerViewingErrorMessage, toDecisionBody } from './owner-model';
import apiSource from './owner-api.ts?raw';
import hooksSource from './owner-hooks.ts?raw';
import modelSource from './owner-model.ts?raw';
import pageSource from '../../pages/workspace/ViewingPages.tsx?raw';
import propertyApiSource from '../property/api.ts?raw';
import propertyTypesSource from '../property/types.ts?raw';
import propertyMockSource from '../../mocks/handlers/property.mock.ts?raw';
import routerSource from '../../app/router.tsx?raw';

const WS = db.tenants[0]!.workspaceId;
const REQ = '77777777-7777-4777-8777-777777777777';
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HOUR = 3_600_000;

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
  ctl.empty = false;
});

describe('HTTP adapter: 3 endpoint /workspaces/:ws/viewing-requests', () => {
  it('list gửi status/page/limit; confirm/reject là PATCH riêng với { note? }', async () => {
    http.get.mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    await viewingsOwnerHttp.list(WS, { status: 'PENDING', page: 2, limit: 10 });
    expect(http.get).toHaveBeenLastCalledWith(`/workspaces/${WS}/viewing-requests`, { query: { status: 'PENDING', page: 2, limit: 10 } });
    await viewingsOwnerHttp.list(WS, { page: 1, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith(`/workspaces/${WS}/viewing-requests`, { query: { status: undefined, page: 1, limit: 20 } });
    http.patch.mockResolvedValue({});
    await viewingsOwnerHttp.confirm(WS, REQ, { note: 'Hẹn gặp ở sảnh' });
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/viewing-requests/${REQ}/confirm`, { note: 'Hẹn gặp ở sảnh' });
    await viewingsOwnerHttp.reject(WS, REQ, {});
    expect(http.patch).toHaveBeenLastCalledWith(`/workspaces/${WS}/viewing-requests/${REQ}/reject`, {});
  });

  it('không còn URL legacy /workspaces/:ws/viewings, không COMPLETED/visitorPhone/OWNER hủy, đúng 3 lời gọi HTTP', () => {
    const all = strip(apiSource + hooksSource + modelSource + pageSource);
    expect(all).not.toMatch(/workspaces\/(\$\{[^}]*\}|[^/'"`]+)\/viewings(?!-)/);
    expect(strip(apiSource)).toMatch(/viewing-requests/);
    expect(all).not.toMatch(/COMPLETED|visitorPhone|visitorName|Hoàn thành|Hủy lịch|WsViewing/);
    expect(strip(apiSource).match(/httpClient\.(get|post|patch|delete)\(/g) ?? []).toHaveLength(3);
    expect(strip(propertyApiSource + propertyTypesSource + propertyMockSource)).not.toMatch(/WsViewing|listViewings|setViewingStatus|wsViewings/);
    expect(strip(routerSource)).toMatch(/ViewingRequestsPage/);
    expect(strip(routerSource)).not.toMatch(/WsViewingsPage/);
  });
});

describe('model', () => {
  it('chỉ PENDING mới xử lý được; ghi chú ≤1000 ký tự và chỉ gửi khi có', () => {
    expect(canDecideViewing({ status: 'PENDING' })).toBe(true);
    for (const s of ['CONFIRMED', 'REJECTED', 'CANCELLED'] as const) expect(canDecideViewing({ status: s })).toBe(false);
    expect(decisionSchema.safeParse({ note: '' }).success).toBe(true);
    expect(decisionSchema.safeParse({ note: 'x'.repeat(1000) }).success).toBe(true);
    expect(decisionSchema.safeParse({ note: 'x'.repeat(1001) }).success).toBe(false);
    expect(toDecisionBody({ note: '   ' })).toEqual({});
    expect(toDecisionBody({ note: ' Hẹn gặp ' })).toEqual({ note: 'Hẹn gặp' });
    expect(PAGE_SIZE).toBe(20);
  });
  it('thông báo lỗi theo mã backend', () => {
    const e = (statusCode: number, code: string) => new ApiError({ statusCode, code, message: 'raw' });
    expect(ownerViewingErrorMessage(e(409, 'VIEWING_REQUEST_NOT_ELIGIBLE'))).toMatch(/giờ hẹn đã qua/);
    expect(ownerViewingErrorMessage(e(409, 'VIEWING_REQUEST_INVALID_TRANSITION'))).toMatch(/đã được xử lý|đã hủy/);
    expect(ownerViewingErrorMessage(e(404, 'VIEWING_REQUEST_NOT_FOUND'))).toMatch(/Không tìm thấy/);
    expect(ownerViewingErrorMessage(e(409, 'WORKSPACE_ARCHIVED'))).toMatch(/lưu trữ/);
  });
});

// ===================================================================== Mock theo đúng backend
const asOwner = (status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE', ws = WS) => {
  ctl.record = { user: { id: 'u-owner', fullName: 'Quân', email: 'quan@demo.vn', globalRole: 'USER' }, memberships: [{ workspaceId: ws, name: 'WS', status, role: 'OWNER' }] };
};
const page = { page: 1, limit: 50 };

describe('mock: danh sách và xử lý', () => {
  it('chỉ OWNER của workspace; người khác bị 403', async () => {
    ctl.record = { user: { id: 'u-x', fullName: 'X', email: 'x@x.vn', globalRole: 'USER' }, memberships: [] };
    await expect(viewingsOwnerMock.list(WS, page)).rejects.toMatchObject({ status: 403 });
    await expect(viewingsOwnerMock.confirm(WS, 'vr-seed-1', {})).rejects.toMatchObject({ status: 403 });
  });

  it('trang sắp theo giờ hẹn tăng dần; đúng trường backend; 4 trạng thái; lọc và phân trang', async () => {
    asOwner();
    const all = await viewingsOwnerMock.list(WS, page);
    expect(all.total).toBe(7);
    expect(all.items.map((v) => v.scheduledAt)).toEqual([...all.items.map((v) => v.scheduledAt)].sort());
    expect(new Set(all.items.map((v) => v.status))).toEqual(new Set(['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED']));
    for (const v of all.items) {
      expect(Object.keys(v).sort()).toEqual(['cancelledAt', 'createdAt', 'decidedAt', 'decisionNote', 'id', 'listingId', 'message', 'requester', 'room', 'scheduledAt', 'status', 'updatedAt']);
      expect(Object.keys(v.requester).sort()).toEqual(['displayName', 'email', 'id']);
      expect(v.requester).not.toHaveProperty('phone');
    }
    expect((await viewingsOwnerMock.list(WS, { status: 'PENDING', page: 1, limit: 50 })).total).toBe(3);
    expect(await viewingsOwnerMock.list(WS, { page: 2, limit: 2 })).toMatchObject({ page: 2, limit: 2, total: 7 });
    await expect(viewingsOwnerMock.list(WS, { page: 1, limit: 51 })).rejects.toMatchObject({ status: 400 });
    await expect(viewingsOwnerMock.list(WS, { status: 'COMPLETED' as never, page: 1, limit: 20 })).rejects.toMatchObject({ status: 400 });
    asOwner('ACTIVE', 'ws-khac');
    expect((await viewingsOwnerMock.list('ws-khac', page)).total).toBe(0); // không thấy yêu cầu của workspace khác
  });

  it('PENDING → CONFIRMED | REJECTED; xử lý lại → 409; ghi chú được cắt và giới hạn 1000', async () => {
    asOwner();
    await expect(viewingsOwnerMock.confirm(WS, 'khong-co', {})).rejects.toMatchObject({ status: 404, code: 'VIEWING_REQUEST_NOT_FOUND' });
    await expect(viewingsOwnerMock.confirm(WS, 'vr-seed-1', { note: 'x'.repeat(1001) })).rejects.toMatchObject({ status: 400 });
    const ok = await viewingsOwnerMock.confirm(WS, 'vr-seed-1', { note: '  Hẹn gặp  ' });
    expect(ok).toMatchObject({ id: 'vr-seed-1', status: 'CONFIRMED', decisionNote: 'Hẹn gặp' });
    expect(ok.decidedAt).toBeTruthy();
    await expect(viewingsOwnerMock.confirm(WS, 'vr-seed-1', {})).rejects.toMatchObject({ status: 409, code: 'VIEWING_REQUEST_INVALID_TRANSITION' });
    await expect(viewingsOwnerMock.reject(WS, 'vr-seed-1', {})).rejects.toMatchObject({ status: 409, code: 'VIEWING_REQUEST_INVALID_TRANSITION' });
    const rejected = await viewingsOwnerMock.reject(WS, 'vr-seed-2', {});
    expect(rejected).toMatchObject({ status: 'REJECTED', decisionNote: null });
    // đã hủy / đã từ chối từ trước không đổi được
    await expect(viewingsOwnerMock.reject(WS, 'vr-seed-7', {})).rejects.toMatchObject({ status: 409 });
    expect(findViewingRequest('vr-seed-1')?.status).toBe('CONFIRMED'); // người xem đọc lại đúng trạng thái
  });

  it('giờ hẹn đã qua: không xác nhận được (409 NOT_ELIGIBLE) nhưng vẫn từ chối được', async () => {
    asOwner();
    await expect(viewingsOwnerMock.confirm(WS, 'vr-seed-3', {})).rejects.toMatchObject({ status: 409, code: 'VIEWING_REQUEST_NOT_ELIGIBLE' });
    expect((await viewingsOwnerMock.reject(WS, 'vr-seed-3', { note: 'Quá giờ' })).status).toBe('REJECTED');
  });

  it('workspace đã lưu trữ chỉ xem: xử lý bị 409 WORKSPACE_ARCHIVED; yêu cầu mới của người xem hiện cho OWNER', async () => {
    const room = db.rooms.find((r) => r.workspaceId === WS)!;
    addViewingRequest({
      id: 'vr-new', listingId: room.id, scheduledAt: new Date(Date.now() + 5 * HOUR).toISOString(), message: 'Em xem thử', status: 'PENDING', decisionNote: null, decidedAt: null, cancelledAt: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requester: { id: 'u-guest', email: 'minh@demo.vn', displayName: 'Minh' }, room: { id: room.id, code: room.code, buildingName: room.buildingName },
    });
    asOwner('ARCHIVED');
    expect((await viewingsOwnerMock.list(WS, page)).items.some((v) => v.id === 'vr-new')).toBe(true);
    await expect(viewingsOwnerMock.reject(WS, 'vr-new', {})).rejects.toMatchObject({ status: 409, code: 'WORKSPACE_ARCHIVED' });
  });
});

// ===================================================================== Trang
const reqDto = (o: Partial<ViewingRequestResponse> = {}): ViewingRequestResponse => ({
  id: REQ, listingId: 'l1', scheduledAt: '2026-10-20T07:00:00.000Z', message: 'Em đi một mình', status: 'PENDING', decisionNote: null, decidedAt: null, cancelledAt: null,
  createdAt: '2026-10-15T01:00:00.000Z', updatedAt: '2026-10-15T01:00:00.000Z', requester: { id: 'u1', email: 'kiet@mail.vn', displayName: 'Vũ Tuấn Kiệt' }, room: { id: 'r1', code: 'P.102', buildingName: 'Tòa A' }, ...o,
});

function mount(entry: string, memberStatus: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: '/w/:workspaceId', element: <Outlet context={{ workspaceId: WS, role: 'OWNER', status: memberStatus, name: 'WS' }} />, children: [{ path: 'viewings', element: <ViewingRequestsPage /> }] }],
    { initialEntries: [entry] },
  );
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}
const listing = (items: ViewingRequestResponse[], total = items.length) => ({ items, page: 1, limit: 20, total });

describe('trang Yêu cầu xem phòng', () => {
  it('mặc định tab Chờ xác nhận (status=PENDING); chỉ PENDING có nút; không SĐT/Hoàn thành', async () => {
    http.get.mockImplementation(async (_u: string, o?: { query?: { status?: string } }) =>
      o?.query?.status === 'PENDING' ? listing([reqDto(), reqDto({ id: 'b', status: 'PENDING', requester: { id: 'u2', email: 'ngoc@mail.vn', displayName: null } })]) : listing([]),
    );
    mount(`/w/${WS}/viewings`);
    expect(await screen.findByText('Vũ Tuấn Kiệt')).toBeTruthy();
    expect(screen.getAllByText('ngoc@mail.vn').length).toBeGreaterThan(0); // không có tên hiển thị → dùng email
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/viewing-requests`, { query: { status: 'PENDING', page: 1, limit: 20 } });
    expect(screen.getAllByRole('button', { name: 'Xác nhận' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Từ chối' })).toHaveLength(2);
    expect(screen.queryByText(/Hoàn thành|Đã xem|Hủy lịch|09\d{8}/)).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Chờ xác nhận', 'Đã xác nhận', 'Bị từ chối', 'Đã hủy', 'Tất cả']);
  });

  it('xác nhận gửi PATCH /confirm với ghi chú; thành công thì làm mới danh sách', async () => {
    http.get.mockResolvedValue(listing([reqDto()]));
    http.patch.mockResolvedValue(reqDto({ status: 'CONFIRMED' }));
    mount(`/w/${WS}/viewings`);
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.type(within(dlg).getByLabelText(/^Ghi chú/), '  Hẹn gặp ở sảnh ');
    const before = http.get.mock.calls.length;
    await userEvent.click(within(dlg).getByRole('button', { name: 'Xác nhận lịch xem' }));
    await waitFor(() => expect(http.patch).toHaveBeenCalledWith(`/workspaces/${WS}/viewing-requests/${REQ}/confirm`, { note: 'Hẹn gặp ở sảnh' }));
    expect(await screen.findByText('Đã xác nhận lịch xem.')).toBeTruthy();
    await waitFor(() => expect(http.get.mock.calls.length).toBeGreaterThan(before));
  });

  it('từ chối không cần ghi chú ({}); lỗi 409 hiện thông báo theo mã', async () => {
    http.get.mockResolvedValue(listing([reqDto()]));
    http.patch.mockRejectedValue(new ApiError({ statusCode: 409, code: 'VIEWING_REQUEST_NOT_ELIGIBLE', message: 'raw' }));
    mount(`/w/${WS}/viewings`);
    await userEvent.click(await screen.findByRole('button', { name: 'Từ chối' }));
    const dlg = await screen.findByRole('dialog');
    await userEvent.click(within(dlg).getByRole('button', { name: 'Từ chối yêu cầu' }));
    await waitFor(() => expect(http.patch).toHaveBeenCalledWith(`/workspaces/${WS}/viewing-requests/${REQ}/reject`, {}));
    expect(await screen.findByText(/giờ hẹn đã qua/)).toBeTruthy();
  });

  it('tab khác gửi đúng status; yêu cầu đã xử lý hiện phản hồi và không có nút; workspace lưu trữ ẩn thao tác', async () => {
    http.get.mockResolvedValue(listing([reqDto({ status: 'CONFIRMED', decisionNote: 'Hẹn gặp', decidedAt: '2026-10-16T01:00:00.000Z' }), reqDto({ id: 'c', status: 'CANCELLED', cancelledAt: '2026-10-16T02:00:00.000Z' })]));
    mount(`/w/${WS}/viewings?status=CONFIRMED`);
    expect(await screen.findByText('Hẹn gặp')).toBeTruthy();
    expect(http.get).toHaveBeenCalledWith(`/workspaces/${WS}/viewing-requests`, { query: { status: 'CONFIRMED', page: 1, limit: 20 } });
    expect(screen.getByText(/Người xem hủy lúc/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xác nhận|Từ chối/ })).toBeNull();
  });

  it('workspace đã lưu trữ chỉ xem (không có nút xử lý ở yêu cầu đang chờ)', async () => {
    http.get.mockResolvedValue(listing([reqDto()]));
    mount(`/w/${WS}/viewings`, 'ARCHIVED');
    expect(await screen.findByText('Vũ Tuấn Kiệt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
  });

  it('Tất cả không gửi status; phân trang gửi đúng page', async () => {
    http.get.mockResolvedValue(listing([reqDto()], 45));
    mount(`/w/${WS}/viewings?status=ALL`);
    await screen.findByText('Vũ Tuấn Kiệt');
    expect(http.get).toHaveBeenLastCalledWith(`/workspaces/${WS}/viewing-requests`, { query: { status: undefined, page: 1, limit: 20 } });
    await userEvent.click(screen.getByRole('button', { name: '2' }));
    await waitFor(() => expect(http.get).toHaveBeenLastCalledWith(`/workspaces/${WS}/viewing-requests`, { query: { status: undefined, page: 2, limit: 20 } }));
  });
});
