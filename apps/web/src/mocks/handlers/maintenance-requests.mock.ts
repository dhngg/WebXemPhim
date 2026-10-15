import { MAINTENANCE_TRANSITIONS, type MaintenanceRequestResponse } from '@rental/shared';
import type { MaintenanceOwnerApi } from '@/features/maintenance/owner-api';
import { ApiError } from '@/services/http/ApiError';
import { db, nextId } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';
import { tenancyMock } from './tenancy.mock';

/**
 * Mock theo đúng quy tắc của backend (Maintenance, phía OWNER): mọi URL có tòa nhà; chỉ OWNER; trạng thái tuần tự
 * OPEN → IN_PROGRESS → RESOLVED → CLOSED (không nhảy cóc, không mở lại); RESOLVED bắt buộc ghi chú; PATCH chỉ đổi
 * title/description/priority; yêu cầu do OWNER tạo tự gắn hợp đồng ĐANG có hiệu lực của phòng (không gắn hợp đồng tương lai).
 * Không có người phụ trách, bình luận hay ảnh.
 */
export const maintenanceStore: MaintenanceRequestResponse[] = [];
const seeded = new Set<string>();

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const now = () => new Date().toISOString();

function scope(ws: string, buildingId: string) {
  const { user } = requireMember(ws, 'rooms.write');
  if (!db.buildings.some((b) => b.workspaceId === ws && b.id === buildingId)) fail(404, 'BUILDING_NOT_FOUND', 'Building not found');
  seed(ws, buildingId);
  return user;
}

/** Dữ liệu mẫu lần đầu truy cập tòa nhà: lấy từ dữ liệu demo cũ, dựng lại đúng hình dạng backend. */
function seed(ws: string, buildingId: string) {
  if (seeded.has(buildingId)) return;
  seeded.add(buildingId);
  for (const m of db.maintenance) {
    const room = db.rooms.find((r) => r.id === m.roomId);
    if (!room || room.buildingId !== buildingId) continue;
    const status = m.status;
    maintenanceStore.push({
      id: m.id, workspaceId: ws, buildingId, roomId: m.roomId, contractId: null, tenantId: null, requestedBy: null,
      title: m.title, description: m.description, priority: m.priority === 'URGENT' ? 'URGENT' : m.priority, status,
      assigneeUserId: null, resolutionNote: status === 'RESOLVED' ? 'Đã xử lý xong.' : null, resolvedAt: status === 'RESOLVED' ? m.updatedAt : null, closedAt: null,
      createdAt: m.createdAt, updatedAt: m.updatedAt,
      history: [{ id: nextId('mh'), fromStatus: null, toStatus: 'OPEN', priority: m.priority, assigneeUserId: null, note: null, changedBy: null, createdAt: m.createdAt }],
    });
  }
}

const find = (ws: string, buildingId: string, id: string) =>
  maintenanceStore.find((r) => r.workspaceId === ws && r.buildingId === buildingId && r.id === id) ?? fail(404, 'MAINTENANCE_NOT_FOUND', 'Request not found');
const withoutHistory = (r: MaintenanceRequestResponse): MaintenanceRequestResponse => {
  const { history, ...rest } = r;
  void history;
  return rest;
};

export const maintenanceOwnerMock: MaintenanceOwnerApi = {
  async list(ws, buildingId, f, page) {
    await simulate();
    scope(ws, buildingId);
    const all = maintenanceStore
      .filter((r) => r.workspaceId === ws && r.buildingId === buildingId)
      .filter((r) => (!f.status || r.status === f.status) && (!f.priority || r.priority === f.priority) && (!f.roomId || r.roomId === f.roomId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // danh sách không kèm lịch sử, như backend
    return { items: all.slice((page.page - 1) * page.limit, page.page * page.limit).map(withoutHistory), page: page.page, limit: page.limit, total: all.length };
  },

  async create(ws, buildingId, input) {
    await simulate();
    const user = scope(ws, buildingId);
    if (!db.rooms.some((r) => r.workspaceId === ws && r.buildingId === buildingId && r.id === input.roomId)) fail(404, 'ROOM_NOT_FOUND', 'Room not found');
    const contract = (await tenancyMock.listContracts(ws)).find((c) => c.roomId === input.roomId && (c.phase === 'IN_EFFECT' || c.phase === 'OVERDUE'));
    const t = now();
    const priority = input.priority ?? 'MEDIUM';
    const req: MaintenanceRequestResponse = {
      id: nextId('mnt'), workspaceId: ws, buildingId, roomId: input.roomId, contractId: contract?.id ?? null, tenantId: contract?.tenantId ?? null, requestedBy: user.id,
      title: input.title.trim(), description: input.description.trim(), priority, status: 'OPEN', assigneeUserId: null, resolutionNote: null, resolvedAt: null, closedAt: null,
      createdAt: t, updatedAt: t,
      history: [{ id: nextId('mh'), fromStatus: null, toStatus: 'OPEN', priority, assigneeUserId: null, note: null, changedBy: user.id, createdAt: t }],
    };
    maintenanceStore.push(req);
    return req;
  },

  async get(ws, buildingId, requestId) {
    await simulate();
    scope(ws, buildingId);
    return find(ws, buildingId, requestId);
  },

  async update(ws, buildingId, requestId, patch) {
    await simulate();
    const user = scope(ws, buildingId);
    const r = find(ws, buildingId, requestId);
    if (r.status === 'CLOSED' || r.status === 'CANCELLED') fail(409, 'MAINTENANCE_NOT_EDITABLE', 'Request is closed');
    if (patch.title !== undefined) r.title = patch.title.trim();
    if (patch.description !== undefined) r.description = patch.description.trim();
    if (patch.priority !== undefined && patch.priority !== r.priority) {
      r.priority = patch.priority;
      r.history = [...(r.history ?? []), { id: nextId('mh'), fromStatus: r.status, toStatus: r.status, priority: r.priority, assigneeUserId: null, note: patch.note ?? null, changedBy: user.id, createdAt: now() }];
    }
    r.updatedAt = now();
    return r;
  },

  async transition(ws, buildingId, requestId, input) {
    await simulate();
    const user = scope(ws, buildingId);
    const r = find(ws, buildingId, requestId);
    if (!MAINTENANCE_TRANSITIONS[r.status].includes(input.toStatus)) fail(409, 'MAINTENANCE_INVALID_TRANSITION', 'Transition not allowed');
    const note = input.note?.trim();
    if (input.toStatus === 'RESOLVED' && !note) fail(400, 'VALIDATION_ERROR', 'A resolution note is required');
    const t = now();
    const from = r.status;
    r.status = input.toStatus;
    r.updatedAt = t;
    if (input.toStatus === 'RESOLVED') {
      r.resolutionNote = note ?? null;
      r.resolvedAt = t;
    }
    if (input.toStatus === 'CLOSED') r.closedAt = t;
    r.history = [...(r.history ?? []), { id: nextId('mh'), fromStatus: from, toStatus: input.toStatus, priority: r.priority, assigneeUserId: null, note: note ?? null, changedBy: user.id, createdAt: t }];
    return r;
  },
};
