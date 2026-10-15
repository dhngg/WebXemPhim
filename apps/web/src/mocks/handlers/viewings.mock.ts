import type { ViewingsApi } from '@/features/viewings/api';
import type { Viewing } from '@/features/viewings/types';
import { canCancelViewing } from '@/features/viewings/types';
import { ApiError } from '@/services/http/ApiError';
import { mockRooms } from '../data/rooms';
import { db } from '../db';
import { notFound, simulate } from '../mockUtils';
import { currentMockUser } from './auth.mock';
import { roomsMock } from './rooms.mock';
import { addViewingRequest, findViewingRequest } from './viewing-requests.mock';

/** Lịch xem lưu trong bộ nhớ, gắn theo userId (khách vãng lai dùng 'guest'). */
const store = new Map<string, Viewing[]>([
  [
    'u-guest',
    [
      {
        id: 'vw-seed-1',
        listingId: 'r-3',
        roomId: 'r-3',
        roomTitle: mockRooms[2]!.title,
                scheduledAt: '2026-10-10T03:00:00.000Z',
        status: 'REJECTED',
        decisionNote: 'Phòng đã có người đặt cọc.',
        createdAt: '2026-10-08T03:00:00.000Z',
      },
      {
        id: 'vw-seed-2',
        listingId: 'r-6',
        roomId: 'r-6',
        roomTitle: mockRooms[5]!.title,
                scheduledAt: '2026-10-16T10:00:00.000Z',
        status: 'CONFIRMED',
        createdAt: '2026-10-12T03:00:00.000Z',
      },
    ],
  ],
]);

function ownerKey() {
  return currentMockUser()?.user.id ?? 'guest';
}

export const viewingsMock: ViewingsApi = {
  async create(input) {
    await simulate();
    const room = (await roomsMock.getById(input.listingId).catch(() => null)) ?? notFound('Phòng không tồn tại.');
    if (new Date(input.scheduledAt).getTime() < Date.now()) {
      throw new ApiError({
        statusCode: 400,
        message: 'Thời gian xem phòng không hợp lệ.',
        code: 'VALIDATION_ERROR',
        fieldErrors: { date: 'Vui lòng chọn thời gian trong tương lai.' },
      });
    }
    const key = ownerKey();
    const list = store.get(key) ?? [];
    if (list.some((v) => v.listingId === input.listingId && v.scheduledAt === input.scheduledAt && (v.status === 'PENDING' || v.status === 'CONFIRMED'))) {
      throw new ApiError({
        statusCode: 409,
        code: 'VIEWING_REQUEST_CONFLICT',
        message: 'An active viewing request already exists for this schedule',
      });
    }
    const viewing: Viewing = {
      id: `vw-${Date.now()}`,
      listingId: room.id,
      roomId: room.roomId ?? room.id,
      roomTitle: room.title,
      scheduledAt: input.scheduledAt,
      status: 'PENDING',
      note: input.note,
      createdAt: new Date().toISOString(),
    };
    store.set(key, [viewing, ...list]);
    // Phòng thuộc workspace → OWNER thấy yêu cầu trong /workspaces/:ws/viewing-requests (cùng id để đồng bộ trạng thái).
    const wsRoom = db.rooms.find((r) => r.id === room.id);
    if (wsRoom) {
      const me = currentMockUser()?.user;
      addViewingRequest({
        id: viewing.id,
        listingId: room.id,
        scheduledAt: input.scheduledAt,
        message: input.note ?? null,
        status: 'PENDING',
        decisionNote: null,
        decidedAt: null,
        cancelledAt: null,
        createdAt: viewing.createdAt,
        updatedAt: viewing.createdAt,
        requester: { id: me?.id ?? 'guest', email: me?.email ?? '', displayName: me?.fullName ?? null },
        room: { id: wsRoom.id, code: wsRoom.code, buildingName: wsRoom.buildingName },
      });
    }
    return viewing;
  },

  async listMine() {
    const { empty } = await simulate();
    if (empty) return [];
    const list = store.get(ownerKey()) ?? [];
    list.forEach((v) => {
      const decided = findViewingRequest(v.id);
      if (decided) {
        v.status = decided.status;
        v.decisionNote = decided.decisionNote ?? undefined;
      }
    });
    return [...list].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  },

  async cancel(viewingId) {
    await simulate();
    const list = store.get(ownerKey()) ?? [];
    const viewing = list.find((v) => v.id === viewingId) ?? notFound('Không tìm thấy lịch xem.');
    if (!canCancelViewing(viewing.status)) {
      throw new ApiError({ statusCode: 409, code: 'VIEWING_REQUEST_INVALID_TRANSITION', message: 'Lịch xem này không thể hủy ở trạng thái hiện tại.' });
    }
    viewing.status = 'CANCELLED';
    const shared = findViewingRequest(viewingId);
    if (shared) Object.assign(shared, { status: 'CANCELLED', cancelledAt: new Date().toISOString() });
    return viewing;
  },
};
