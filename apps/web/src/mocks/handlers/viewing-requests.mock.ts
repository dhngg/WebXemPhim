import type { ViewingRequestResponse } from '@rental/shared';
import type { ViewingsOwnerApi } from '@/features/viewings/owner-api';
import { ApiError } from '@/services/http/ApiError';
import { db } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';
import { isListingRemoved } from './admin.mock';

/**
 * Mock theo ĐÚNG hình dạng và quy tắc của `/workspaces/:ws/viewing-requests`: chỉ OWNER; trang `{ items, page, limit, total }`
 * sắp theo giờ hẹn tăng dần; chỉ PENDING → CONFIRMED | REJECTED (ghi chú tùy chọn ≤1000); xác nhận cần giờ hẹn ở tương lai và
 * tin còn đủ điều kiện; trạng thái chỉ PENDING/CONFIRMED/REJECTED/CANCELLED (không COMPLETED, không SĐT người xem, OWNER không hủy).
 * Sổ này dùng chung với mock “Lịch xem của tôi” nên người xem thấy kết quả. Chỉ dùng khi VITE_USE_MOCK_API=true.
 */
const HOUR = 3_600_000;
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

export const viewingRequestStore: ViewingRequestResponse[] = [];

type Seed = [name: string, email: string, code: string, hoursFromNow: number, status: ViewingRequestResponse['status'], message: string | null, note: string | null];
const SEEDS: Seed[] = [
  ['Vũ Tuấn Kiệt', 'kiet@mail.vn', 'P.102', 26, 'PENDING', 'Em đi một mình, cần phòng gần trường.', null],
  ['Hoàng Bảo Ngọc', 'ngoc@mail.vn', 'B.304', 53, 'PENDING', null, null],
  ['Đỗ Thu Trang', 'trang@mail.vn', 'C.101', -20, 'PENDING', 'Hẹn xem buổi sáng.', null],
  ['Phan Minh Thắng', 'thang@mail.vn', 'C.101', 21, 'CONFIRMED', null, 'Hẹn gặp ở cổng chính.'],
  ['Lê Minh', 'minh.le@mail.vn', 'B.304', 74, 'CONFIRMED', null, null],
  ['Trương Mỹ Duyên', 'duyen@mail.vn', 'P.102', -50, 'REJECTED', null, 'Phòng đã có người đặt cọc.'],
  ['Ông Văn Thịnh', 'thinh@mail.vn', 'C.101', -75, 'CANCELLED', null, null],
];

function seed() {
  if (viewingRequestStore.length) return;
  const ws = db.tenants[0]!.workspaceId;
  SEEDS.forEach(([name, email, code, hours, status, message, note], i) => {
    const room = db.rooms.find((r) => r.workspaceId === ws && r.code === code);
    if (!room) return;
    const created = iso(hours * HOUR - 48 * HOUR);
    viewingRequestStore.push({
      id: `vr-seed-${i + 1}`, listingId: room.id, scheduledAt: iso(hours * HOUR), message, status, decisionNote: note,
      decidedAt: status === 'CONFIRMED' || status === 'REJECTED' ? created : null, cancelledAt: status === 'CANCELLED' ? created : null, createdAt: created, updatedAt: created,
      requester: { id: `u-viewer-${i + 1}`, email, displayName: name }, room: { id: room.id, code: room.code, buildingName: room.buildingName },
    });
  });
}

/** Người xem (mock “Lịch xem của tôi”) tạo yêu cầu cho phòng của workspace → OWNER thấy ngay. */
export function addViewingRequest(entry: ViewingRequestResponse) {
  seed();
  viewingRequestStore.push(entry);
}
/** Trạng thái hiện tại của một yêu cầu (người xem đọc lại sau khi OWNER xử lý). */
export function findViewingRequest(id: string) {
  seed();
  return viewingRequestStore.find((v) => v.id === id);
}

function scope(ws: string) {
  const { user, membership } = requireMember(ws, 'rooms.write');
  seed();
  return { user, archived: membership.status === 'ARCHIVED' };
}
const inWorkspace = (ws: string, v: ViewingRequestResponse) => db.rooms.some((r) => r.workspaceId === ws && r.id === v.room.id);
const find = (ws: string, id: string) => viewingRequestStore.find((v) => v.id === id && inWorkspace(ws, v)) ?? fail(404, 'VIEWING_REQUEST_NOT_FOUND', 'Viewing request not found');

function decide(ws: string, id: string, status: 'CONFIRMED' | 'REJECTED', body: { note?: string }) {
  const { archived } = scope(ws);
  const note = body.note?.trim();
  if (note && note.length > 1000) fail(400, 'VALIDATION_ERROR', 'note must be at most 1000 characters');
  if (archived) fail(409, 'WORKSPACE_ARCHIVED', 'Workspace is archived');
  const v = find(ws, id);
  if (v.status !== 'PENDING') fail(409, 'VIEWING_REQUEST_INVALID_TRANSITION', 'Only PENDING requests can be decided');
  if (status === 'CONFIRMED') {
    const room = db.rooms.find((r) => r.id === v.room.id);
    if (Date.parse(v.scheduledAt) <= Date.now() || isListingRemoved(v.listingId) || room?.operationalStatus !== 'VACANT') {
      fail(409, 'VIEWING_REQUEST_NOT_ELIGIBLE', 'The viewing request is no longer eligible');
    }
  }
  const now = new Date().toISOString();
  Object.assign(v, { status, decisionNote: note || null, decidedAt: now, updatedAt: now });
  return { ...v };
}

export const viewingsOwnerMock: ViewingsOwnerApi = {
  async list(ws, q) {
    const { empty } = await simulate();
    scope(ws);
    if (!Number.isInteger(q.page) || q.page < 1 || !Number.isInteger(q.limit) || q.limit < 1 || q.limit > 50) fail(400, 'VALIDATION_ERROR', 'page >= 1 and limit 1..50');
    if (q.status && !['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'].includes(q.status)) fail(400, 'VALIDATION_ERROR', 'status is invalid');
    const all = empty
      ? []
      : viewingRequestStore
          .filter((v) => inWorkspace(ws, v) && (!q.status || v.status === q.status))
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
    return { items: all.slice((q.page - 1) * q.limit, q.page * q.limit).map((v) => ({ ...v })), page: q.page, limit: q.limit, total: all.length };
  },
  async confirm(ws, id, body) {
    await simulate();
    return decide(ws, id, 'CONFIRMED', body);
  },
  async reject(ws, id, body) {
    await simulate();
    return decide(ws, id, 'REJECTED', body);
  },
};
