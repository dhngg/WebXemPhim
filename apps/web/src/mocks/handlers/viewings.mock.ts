import type { ViewingsApi } from '@/features/viewings/api';
import type { Viewing } from '@/features/viewings/types';
import { canCancelViewing } from '@/features/viewings/types';
import { ApiError } from '@/services/http/ApiError';
import { mockRooms } from '../data/rooms';
import { db } from '../db';
import { notFound, simulate } from '../mockUtils';
import { currentMockUser } from './auth.mock';
import { roomsMock } from './rooms.mock';

/** Lịch xem lưu trong bộ nhớ, gắn theo userId (khách vãng lai dùng 'guest'). */
const store = new Map<string, Viewing[]>([
  [
    'u-guest',
    [
      {
        id: 'vw-seed-1',
        roomId: 'r-3',
        roomTitle: mockRooms[2]!.title,
        roomAddress: mockRooms[2]!.address,
        roomImage: mockRooms[2]!.images[0],
        scheduledAt: '2026-10-10T03:00:00.000Z',
        status: 'COMPLETED',
        contactName: 'Lê Minh',
        contactPhone: '0988111222',
        createdAt: '2026-10-08T03:00:00.000Z',
      },
      {
        id: 'vw-seed-2',
        roomId: 'r-6',
        roomTitle: mockRooms[5]!.title,
        roomAddress: mockRooms[5]!.address,
        roomImage: mockRooms[5]!.images[0],
        scheduledAt: '2026-10-16T10:00:00.000Z',
        status: 'CONFIRMED',
        contactName: 'Lê Minh',
        contactPhone: '0988111222',
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
    const room = (await roomsMock.getById(input.roomId).catch(() => null)) ?? notFound('Phòng không tồn tại.');
    if (new Date(input.scheduledAt).getTime() < Date.now()) {
      throw new ApiError({
        statusCode: 400,
        message: 'Thời gian xem phòng không hợp lệ.',
        fieldErrors: { date: 'Vui lòng chọn thời gian trong tương lai.' },
      });
    }
    const key = ownerKey();
    const list = store.get(key) ?? [];
    if (list.some((v) => v.roomId === input.roomId && v.status === 'PENDING')) {
      throw new ApiError({
        statusCode: 409,
        message: 'Bạn đã có một yêu cầu xem phòng này đang chờ xác nhận.',
      });
    }
    const viewing: Viewing = {
      id: `vw-${Date.now()}`,
      roomId: room.id,
      roomTitle: room.title,
      roomAddress: room.address,
      roomImage: room.images[0],
      scheduledAt: input.scheduledAt,
      status: 'PENDING',
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      note: input.note,
      createdAt: new Date().toISOString(),
    };
    store.set(key, [viewing, ...list]);
    // Phòng thuộc workspace → chủ trọ thấy yêu cầu ở VIEW-01 (cùng id để đồng bộ trạng thái).
    const wsRoom = db.rooms.find((r) => r.id === room.id);
    if (wsRoom) {
      db.wsViewings.push({
        id: viewing.id,
        workspaceId: wsRoom.workspaceId,
        roomId: wsRoom.id,
        roomCode: wsRoom.code,
        buildingName: wsRoom.buildingName,
        visitorName: input.contactName,
        visitorPhone: input.contactPhone,
        scheduledAt: input.scheduledAt,
        status: 'PENDING',
        note: input.note,
      });
    }
    return viewing;
  },

  async listMine() {
    const { empty } = await simulate();
    if (empty) return [];
    const list = store.get(ownerKey()) ?? [];
    list.forEach((v) => {
      const ws = db.wsViewings.find((w) => w.id === v.id);
      if (ws) v.status = ws.status;
    });
    return [...list].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  },

  async cancel(viewingId) {
    await simulate();
    const list = store.get(ownerKey()) ?? [];
    const viewing = list.find((v) => v.id === viewingId) ?? notFound('Không tìm thấy lịch xem.');
    if (!canCancelViewing(viewing.status)) {
      throw new ApiError({ statusCode: 409, message: 'Lịch xem này không thể hủy ở trạng thái hiện tại.' });
    }
    viewing.status = 'CANCELLED';
    const ws = db.wsViewings.find((w) => w.id === viewingId);
    if (ws) ws.status = 'CANCELLED';
    return viewing;
  },
};
