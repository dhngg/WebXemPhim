import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAINTENANCE_STATUSES, MAINTENANCE_TRANSITIONS, type MaintenanceRequestResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { db } from '@/mocks/db';
import { ApiError } from '@/services/http/ApiError';
import { maintenanceOwnerMock } from '@/mocks/handlers/maintenance-requests.mock';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { maintenanceOwnerHttp } from './owner-api';
import apiSource from './owner-api.ts?raw';
import hooksSource from './owner-hooks.ts?raw';
import pagesSource from '../../pages/workspace/MaintenancePages.tsx?raw';
import { PRIORITY_LABEL, STATUS_LABEL, TRANSITION_ACTION, canEdit, createSchema, diffEdit, editSchema, maintenanceErrorMessage, nextStatus, noteRequired, toCreateBody, transitionSchema } from './owner-model';

const WS = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const R = '44444444-4444-4444-8444-444444444444';
const ROOM = '55555555-5555-4555-8555-555555555555';
const req = (o: Partial<MaintenanceRequestResponse> = {}): MaintenanceRequestResponse => ({
  id: R, workspaceId: WS, buildingId: B, roomId: ROOM, contractId: null, tenantId: null, requestedBy: 'u', title: 'Rò nước', description: 'Vòi rò', priority: 'MEDIUM', status: 'OPEN',
  assigneeUserId: null, resolutionNote: null, resolvedAt: null, closedAt: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...o,
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('lifecycle is forward-only: OPEN → IN_PROGRESS → RESOLVED → CLOSED', () => {
  it('offers exactly one next step and none for terminal states', () => {
    expect(nextStatus('OPEN')).toBe('IN_PROGRESS');
    expect(nextStatus('IN_PROGRESS')).toBe('RESOLVED');
    expect(nextStatus('RESOLVED')).toBe('CLOSED');
    expect(nextStatus('CLOSED')).toBeUndefined();
    expect(nextStatus('CANCELLED')).toBeUndefined(); // cancelled only through the tenant endpoint
    for (const st of MAINTENANCE_STATUSES) expect(MAINTENANCE_TRANSITIONS[st].length).toBeLessThanOrEqual(1);
    expect(Object.keys(STATUS_LABEL)).toEqual([...MAINTENANCE_STATUSES]);
    expect(Object.keys(PRIORITY_LABEL)).toEqual(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);
    expect(TRANSITION_ACTION.OPEN).toBeUndefined(); // no way back to OPEN
  });
  it('only RESOLVED needs a note (max 1000)', () => {
    expect(noteRequired('RESOLVED')).toBe(true);
    expect(noteRequired('IN_PROGRESS')).toBe(false);
    expect(noteRequired('CLOSED')).toBe(false);
    expect(transitionSchema('RESOLVED').safeParse({ note: '  ' }).success).toBe(false);
    expect(transitionSchema('RESOLVED').safeParse({ note: 'Đã thay vòi' }).success).toBe(true);
    expect(transitionSchema('IN_PROGRESS').safeParse({ note: '' }).success).toBe(true);
    expect(transitionSchema('CLOSED').safeParse({ note: 'x'.repeat(1001) }).success).toBe(false);
  });
  it('content is editable until CLOSED/CANCELLED', () => {
    expect(canEdit({ status: 'OPEN' })).toBe(true);
    expect(canEdit({ status: 'RESOLVED' })).toBe(true);
    expect(canEdit({ status: 'CLOSED' })).toBe(false);
    expect(canEdit({ status: 'CANCELLED' })).toBe(false);
  });
});

describe('forms and request bodies follow the DTOs', () => {
  const base = { roomId: ROOM, title: 'Rò nước', description: 'Vòi rò', priority: '' as const };
  it('create: room, title <=150, description <=5000, optional priority never defaulted by the client', () => {
    expect(createSchema.safeParse(base).success).toBe(true);
    expect(createSchema.safeParse({ ...base, roomId: '' }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, title: ' ' }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, title: 'x'.repeat(151) }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, description: 'x'.repeat(5001) }).success).toBe(false);
    expect(createSchema.safeParse({ ...base, priority: 'CRITICAL' }).success).toBe(false);
    expect(toCreateBody(base)).toEqual({ roomId: ROOM, title: 'Rò nước', description: 'Vòi rò' }); // no priority, no contractId
    expect(toCreateBody({ ...base, priority: 'URGENT' })).toMatchObject({ priority: 'URGENT' });
    expect(Object.keys(toCreateBody({ ...base, priority: 'URGENT' }))).not.toContain('contractId');
  });
  it('edit diff carries only title/description/priority that changed and never a status', () => {
    const cur = req();
    expect(diffEdit(cur, { title: 'Rò nước', description: 'Vòi rò', priority: 'MEDIUM' })).toEqual({});
    expect(diffEdit(cur, { title: 'Mới', description: 'Vòi rò', priority: 'HIGH' })).toEqual({ title: 'Mới', priority: 'HIGH' });
    expect(Object.keys(diffEdit(cur, { title: 'a', description: 'b', priority: 'LOW' }))).not.toContain('status');
    expect(editSchema.safeParse({ title: '', description: 'x', priority: 'LOW' }).success).toBe(false);
  });
  it('error codes map to Vietnamese', () => {
    const err = (code: string) => new ApiError({ statusCode: 409, code, message: 'raw' });
    expect(maintenanceErrorMessage(err('MAINTENANCE_INVALID_TRANSITION'))).toMatch(/tuần tự/);
    expect(maintenanceErrorMessage(err('MAINTENANCE_NOT_EDITABLE'))).toMatch(/đã đóng/);
    expect(maintenanceErrorMessage(err('VALIDATION_ERROR'))).toMatch(/ghi chú xử lý/);
    expect(maintenanceErrorMessage(err('OTHER'))).toBe('raw');
  });
});

describe('HTTP adapter: the 5 OWNER endpoints under workspace → building', () => {
  const base = `/workspaces/${WS}/buildings/${B}/maintenance-requests`;
  it('list sends only supported filters (no q, no assignee) with real pagination', async () => {
    http.get.mockResolvedValue({ items: [], page: 2, limit: 20, total: 0 });
    await maintenanceOwnerHttp.list(WS, B, { status: 'OPEN', priority: 'HIGH', roomId: ROOM }, { page: 2, limit: 20 });
    expect(http.get).toHaveBeenCalledWith(base, { query: { status: 'OPEN', priority: 'HIGH', roomId: ROOM, page: 2, limit: 20 } });
    const q = http.get.mock.calls[0]![1].query as Record<string, unknown>;
    expect(Object.keys(q)).not.toContain('q');
    expect(Object.keys(q)).not.toContain('assigneeUserId');
  });
  it('create / detail / PATCH (content only) / transition (own endpoint)', async () => {
    http.post.mockResolvedValue(req());
    await maintenanceOwnerHttp.create(WS, B, { roomId: ROOM, title: 'a', description: 'b' });
    expect(http.post).toHaveBeenLastCalledWith(base, { roomId: ROOM, title: 'a', description: 'b' });
    http.get.mockResolvedValue(req());
    await maintenanceOwnerHttp.get(WS, B, R);
    expect(http.get).toHaveBeenLastCalledWith(`${base}/${R}`);
    http.patch.mockResolvedValue(req());
    await maintenanceOwnerHttp.update(WS, B, R, { title: 'Mới' });
    expect(http.patch).toHaveBeenLastCalledWith(`${base}/${R}`, { title: 'Mới' });
    await maintenanceOwnerHttp.transition(WS, B, R, { toStatus: 'RESOLVED', note: 'Đã sửa' });
    expect(http.post).toHaveBeenLastCalledWith(`${base}/${R}/transition`, { toStatus: 'RESOLVED', note: 'Đã sửa' });
  });
  it('FE-07 maintenance screens use no legacy endpoint, comment, assignee or image feature', () => {
    for (const [name, text] of Object.entries({ api: apiSource.replace(/\/\*\*[\s\S]*?\*\//g, ''), hooks: hooksSource })) {
      expect(text, name).not.toMatch(/\/comments|assignee|images|\/workspaces\/\$\{[^}]+\}\/maintenance`/i);
    }
    expect(pagesSource).not.toMatch(/features\/maintenance\/api|comment|assignee|Phân công|images/i);
    expect(pagesSource).not.toMatch(/useWorkspaceDashboard/);
  });
});

describe('mock follows the backend (OWNER only, sequential lifecycle, PATCH vs transition)', () => {
  const ws = db.tenants[0]!.workspaceId;
  const b = db.buildings[0]!.id;
  const room = db.rooms.find((r) => r.buildingId === b)!;
  const as = (role = 'OWNER') => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role, status: 'ACTIVE', name: 'WS' }] };
  };
  const page = { page: 1, limit: 20 };

  it('OWNER only; unknown building 404; list is paged, filterable and carries no history', async () => {
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(maintenanceOwnerMock.list(ws, b, {}, page)).rejects.toBeInstanceOf(ApiError);
    }
    as();
    await expect(maintenanceOwnerMock.list(ws, 'nope', {}, page)).rejects.toMatchObject({ code: 'BUILDING_NOT_FOUND' });
    const all = await maintenanceOwnerMock.list(ws, b, {}, page);
    expect(all.total).toBeGreaterThan(0);
    expect(all.items[0]).not.toHaveProperty('history');
    expect((await maintenanceOwnerMock.list(ws, b, {}, { page: 1, limit: 1 })).items).toHaveLength(1);
    const open = await maintenanceOwnerMock.list(ws, b, { status: 'OPEN' }, page);
    expect(open.items.every((r) => r.status === 'OPEN')).toBe(true);
    expect((await maintenanceOwnerMock.list(ws, b, { roomId: 'other' }, page)).total).toBe(0);
  });

  it('create attaches the contract in effect (never a future one) and starts OPEN with a history row', async () => {
    as();
    const contracts = await tenancyMock.listContracts(ws);
    const current = contracts.find((c) => c.buildingId === b && c.phase === 'IN_EFFECT')!;
    const created = await maintenanceOwnerMock.create(ws, b, { roomId: current.roomId, title: '  Hỏng đèn ', description: 'Đèn không sáng', priority: 'HIGH' });
    expect(created).toMatchObject({ status: 'OPEN', priority: 'HIGH', title: 'Hỏng đèn', contractId: current.id, tenantId: current.tenantId, assigneeUserId: null });
    expect(created.history).toHaveLength(1);
    const noContract = await maintenanceOwnerMock.create(ws, b, { roomId: room.id === current.roomId ? db.rooms.filter((r) => r.buildingId === b)[1]!.id : room.id, title: 'x', description: 'y' });
    expect(noContract.priority).toBe('MEDIUM'); // server default, not chosen by the client
    await expect(maintenanceOwnerMock.create(ws, b, { roomId: 'missing', title: 'x', description: 'y' })).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it('transitions are sequential; RESOLVED needs a note; no skip, no reopen; history is kept', async () => {
    as();
    const r = await maintenanceOwnerMock.create(ws, b, { roomId: room.id, title: 'Chuyển trạng thái', description: 'x' });
    await expect(maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'RESOLVED', note: 'bỏ qua' })).rejects.toMatchObject({ code: 'MAINTENANCE_INVALID_TRANSITION' });
    await expect(maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'CLOSED' })).rejects.toMatchObject({ code: 'MAINTENANCE_INVALID_TRANSITION' });
    expect((await maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'IN_PROGRESS' })).status).toBe('IN_PROGRESS');
    await expect(maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'OPEN' })).rejects.toMatchObject({ code: 'MAINTENANCE_INVALID_TRANSITION' }); // no reopen
    await expect(maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'RESOLVED' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'RESOLVED', note: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const resolved = await maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'RESOLVED', note: 'Đã thay vòi' });
    expect(resolved).toMatchObject({ status: 'RESOLVED', resolutionNote: 'Đã thay vòi' });
    expect(resolved.resolvedAt).toBeTruthy();
    const closed = await maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'CLOSED' });
    expect(closed.closedAt).toBeTruthy();
    await expect(maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'CLOSED' })).rejects.toMatchObject({ code: 'MAINTENANCE_INVALID_TRANSITION' });
    const detail = await maintenanceOwnerMock.get(ws, b, r.id);
    expect(detail.history!.map((h) => h.toStatus)).toEqual(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']);
  });

  it('PATCH changes content only, never the status, and is refused once CLOSED', async () => {
    as();
    const r = await maintenanceOwnerMock.create(ws, b, { roomId: room.id, title: 'Sửa nội dung', description: 'x' });
    const edited = await maintenanceOwnerMock.update(ws, b, r.id, { title: 'Tiêu đề mới', priority: 'URGENT', status: 'CLOSED' } as never);
    expect(edited).toMatchObject({ title: 'Tiêu đề mới', priority: 'URGENT', status: 'OPEN' });
    await maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'IN_PROGRESS' });
    await maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'RESOLVED', note: 'ok' });
    await maintenanceOwnerMock.transition(ws, b, r.id, { toStatus: 'CLOSED' });
    await expect(maintenanceOwnerMock.update(ws, b, r.id, { title: 'Không được' })).rejects.toMatchObject({ code: 'MAINTENANCE_NOT_EDITABLE' });
    await expect(maintenanceOwnerMock.get(ws, b, 'missing')).rejects.toMatchObject({ code: 'MAINTENANCE_NOT_FOUND' });
  });
});
