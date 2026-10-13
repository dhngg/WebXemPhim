import type { PropertyApi } from '@/features/property/api';
import type { Building, BuildingWithStats, WsRoom } from '@/features/property/types';
import { audit, db, nextId } from '../db';
import { conflict, includesText, requireMember } from '../guard';
import { notFound, simulate } from '../mockUtils';

function withStats(b: Building): BuildingWithStats {
  const rooms = db.rooms.filter((r) => r.buildingId === b.id);
  return { ...b, roomCount: rooms.length, occupiedCount: rooms.filter((r) => r.operationalStatus === 'OCCUPIED').length };
}

function findBuilding(ws: string, id: string) {
  return db.buildings.find((b) => b.workspaceId === ws && b.id === id) ?? notFound('Không tìm thấy tòa nhà.');
}

function findRoom(ws: string, id: string) {
  return db.rooms.find((r) => r.workspaceId === ws && r.id === id) ?? notFound('Không tìm thấy phòng.');
}

export const propertyMock: PropertyApi = {
  async listBuildings(ws, q) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.buildings
      .filter((b) => b.workspaceId === ws && includesText(`${b.name} ${b.address} ${b.district}`, q))
      .map(withStats);
  },
  async getBuilding(ws, id) {
    await simulate();
    requireMember(ws);
    return withStats(findBuilding(ws, id));
  },
  async createBuilding(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    if (db.buildings.some((b) => b.workspaceId === ws && b.name.toLowerCase() === input.name.trim().toLowerCase())) {
      conflict('Tên tòa nhà đã tồn tại trong workspace.');
    }
    const b: Building = { ...input, id: nextId('bld'), workspaceId: ws, createdAt: new Date().toISOString() };
    db.buildings.push(b);
    audit(user.email, 'Tạo tòa nhà', b.name, 'WORKSPACE');
    return b;
  },
  async updateBuilding(ws, id, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const b = findBuilding(ws, id);
    Object.assign(b, input);
    db.rooms.filter((r) => r.buildingId === id).forEach((r) => (r.buildingName = b.name));
    return b;
  },

  async listRooms(ws, f) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.rooms
      .filter(
        (r) =>
          r.workspaceId === ws &&
          (!f.buildingId || r.buildingId === f.buildingId) &&
          (!f.operationalStatus || r.operationalStatus === f.operationalStatus) &&
          (!f.listingStatus || r.listingStatus === f.listingStatus) &&
          includesText(`${r.code} ${r.buildingName}`, f.q),
      )
      .sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.code.localeCompare(b.code));
  },
  async getRoom(ws, id) {
    await simulate();
    requireMember(ws);
    return findRoom(ws, id);
  },
  async createRoom(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const building = findBuilding(ws, input.buildingId);
    if (db.rooms.some((r) => r.buildingId === input.buildingId && r.code.toLowerCase() === input.code.trim().toLowerCase())) {
      conflict(`Mã phòng ${input.code} đã tồn tại trong ${building.name}.`);
    }
    const room: WsRoom = {
      ...input,
      operationalStatus: input.operationalStatus ?? 'VACANT',
      id: nextId('room'),
      workspaceId: ws,
      buildingName: building.name,
      updatedAt: new Date().toISOString(),
    };
    db.rooms.push(room);
    audit(user.email, 'Tạo phòng', `${building.name} • ${room.code}`, 'WORKSPACE');
    return room;
  },
  async updateRoom(ws, id, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = findRoom(ws, id);
    const building = findBuilding(ws, input.buildingId);
    if (db.rooms.some((r) => r.id !== id && r.buildingId === input.buildingId && r.code.toLowerCase() === input.code.trim().toLowerCase())) {
      conflict(`Mã phòng ${input.code} đã tồn tại trong ${building.name}.`);
    }
    Object.assign(room, input, { buildingName: building.name, updatedAt: new Date().toISOString() });
    return room;
  },
  async setListingStatus(ws, id, status) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const room = findRoom(ws, id);
    room.listingStatus = status;
    room.updatedAt = new Date().toISOString();
    audit(user.email, status === 'PUBLISHED' ? 'Đăng tin phòng' : 'Ẩn tin phòng', room.code, 'LISTING');
    return room;
  },

  async listViewings(ws, status) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.wsViewings
      .filter((v) => v.workspaceId === ws && (!status || v.status === status))
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  },
  async setViewingStatus(ws, id, status) {
    await simulate();
    requireMember(ws);
    const v = db.wsViewings.find((x) => x.workspaceId === ws && x.id === id) ?? notFound('Không tìm thấy lịch xem.');
    const allowed: Record<string, string[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED'],
    };
    if (!allowed[v.status]?.includes(status)) conflict('Không thể chuyển trạng thái lịch xem này.');
    v.status = status;
    return v;
  },
};
