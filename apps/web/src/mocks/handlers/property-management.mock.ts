import type { PropertyManagementApi } from '@/features/property-management/api';
import type { AmenityRef, ManagedBuilding, ManagedRoom, RoomImageItem } from '@/features/property-management/types';
import { AMENITY_LABELS } from '@/features/rooms/labels';
import type { AmenityCode } from '@/features/rooms/types';
import type { Building, WsRoom } from '@/features/property/types';
import { ApiError } from '@/services/http/ApiError';
import { audit, db, nextId } from '../db';
import { includesText, requireMember } from '../guard';
import { notFound, simulate } from '../mockUtils';

/**
 * Mock của quản lý tài sản, dựng trên dữ liệu demo sẵn có (db.buildings / db.rooms) nhưng trả đúng
 * hình dạng của backend thật (chuỗi thập phân, tiện ích có id, ảnh có id/thứ tự, trạng thái ARCHIVED…).
 */
const archivedBuildings = new Set<string>();
const archivedRooms = new Set<string>();
const unavailableRooms = new Set<string>();
const imageAlt = new Map<string, string>();
const customAmenities = new Map<string, AmenityRef[]>(); // theo workspace
const customRoomAmenities = new Map<string, Set<string>>(); // theo phòng

const conflict = (code: string, message: string) => new ApiError({ statusCode: 409, code, message });

function amenityCatalog(ws: string): AmenityRef[] {
  const base = (Object.keys(AMENITY_LABELS) as AmenityCode[]).map((c) => ({ id: c, name: AMENITY_LABELS[c] }));
  return [...base, ...(customAmenities.get(ws) ?? [])];
}

function status(r: WsRoom): ManagedRoom['status'] {
  if (archivedRooms.has(r.id)) return 'ARCHIVED';
  if (r.operationalStatus === 'OCCUPIED') return 'OCCUPIED';
  if (unavailableRooms.has(r.id) || r.operationalStatus === 'RESERVED' || r.operationalStatus === 'MAINTENANCE') return 'UNAVAILABLE';
  return 'VACANT';
}

function imagesOf(r: WsRoom): RoomImageItem[] {
  return r.images.map((url, i) => ({ id: `img-${r.id}-${i}-${url.length}`, url, altText: imageAlt.get(`${r.id}|${url}`), sortOrder: i }));
}

function toRoom(r: WsRoom, withImages = false): ManagedRoom {
  const extra = customRoomAmenities.get(r.id) ?? new Set<string>();
  const catalog = amenityCatalog(r.workspaceId);
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    buildingId: r.buildingId,
    buildingName: r.buildingName,
    code: r.code,
    areaSqm: r.area.toFixed(2),
    monthlyRent: r.basePrice.toFixed(2),
    maxOccupants: r.maxOccupants,
    description: r.description,
    status: status(r),
    archivedAt: archivedRooms.has(r.id) ? r.updatedAt : null,
    amenities: catalog.filter((a) => r.amenities.includes(a.id as AmenityCode) || extra.has(a.id)),
    ...(withImages ? { images: imagesOf(r) } : {}),
    createdAt: r.updatedAt,
    updatedAt: r.updatedAt,
  };
}

function toBuilding(b: Building): ManagedBuilding {
  const rooms = db.rooms.filter((r) => r.buildingId === b.id && !archivedRooms.has(r.id));
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    name: b.name,
    address: b.address,
    ward: b.ward,
    district: b.district,
    city: b.city,
    lat: b.lat,
    lng: b.lng,
    description: b.note,
    status: archivedBuildings.has(b.id) ? 'ARCHIVED' : 'ACTIVE',
    createdAt: b.createdAt,
    roomCount: rooms.length,
    occupiedCount: rooms.filter((r) => r.operationalStatus === 'OCCUPIED').length,
  };
}

const findBuilding = (ws: string, id: string) =>
  db.buildings.find((b) => b.workspaceId === ws && b.id === id) ?? notFound('Không tìm thấy tòa nhà.');
const findRoom = (ws: string, id: string) => db.rooms.find((r) => r.workspaceId === ws && r.id === id) ?? notFound('Không tìm thấy phòng.');
const writableBuilding = (ws: string, id: string) => {
  const b = findBuilding(ws, id);
  if (archivedBuildings.has(id)) throw conflict('BUILDING_ARCHIVED', 'Building is archived');
  return b;
};
const writableRoom = (ws: string, buildingId: string, id: string) => {
  writableBuilding(ws, buildingId);
  const r = findRoom(ws, id);
  if (archivedRooms.has(id)) throw conflict('ROOM_ARCHIVED', 'Room is archived');
  return r;
};
const codeTaken = (buildingId: string, code: string, exceptId?: string) =>
  db.rooms.some((r) => r.buildingId === buildingId && r.id !== exceptId && r.code.toLowerCase() === code.trim().toLowerCase());

export const propertyManagementMock: PropertyManagementApi = {
  async listBuildings(ws, q) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.buildings.filter((b) => b.workspaceId === ws && includesText(`${b.name} ${b.address} ${b.district}`, q)).map(toBuilding);
  },
  async getBuilding(ws, id) {
    await simulate();
    requireMember(ws);
    return toBuilding(findBuilding(ws, id));
  },
  async createBuilding(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const b: Building = {
      id: nextId('bld'),
      workspaceId: ws,
      name: input.name.trim(),
      address: input.address.trim(),
      ward: input.ward ?? '',
      district: input.district ?? '',
      city: input.city.trim(),
      lat: input.lat,
      lng: input.lng,
      floors: 1,
      note: input.description,
      createdAt: new Date().toISOString(),
    };
    db.buildings.push(b);
    audit(user.email, 'Tạo tòa nhà', b.name, 'WORKSPACE');
    return toBuilding(b);
  },
  async updateBuilding(ws, id, patch) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const b = writableBuilding(ws, id);
    if (patch.name !== undefined) b.name = patch.name;
    if (patch.address !== undefined) b.address = patch.address;
    if (patch.ward !== undefined) b.ward = patch.ward;
    if (patch.district !== undefined) b.district = patch.district;
    if (patch.city !== undefined) b.city = patch.city;
    if (patch.description !== undefined) b.note = patch.description;
    if (patch.lat !== undefined && patch.lng !== undefined) Object.assign(b, { lat: patch.lat, lng: patch.lng });
    db.rooms.filter((r) => r.buildingId === id).forEach((r) => (r.buildingName = b.name));
    return toBuilding(b);
  },
  async archiveBuilding(ws, id) {
    await simulate();
    requireMember(ws, 'buildings.archive');
    const b = findBuilding(ws, id);
    archivedBuildings.add(id);
    return toBuilding(b);
  },
  async restoreBuilding(ws, id) {
    await simulate();
    requireMember(ws, 'buildings.archive');
    const b = findBuilding(ws, id);
    archivedBuildings.delete(id);
    return toBuilding(b);
  },

  async listRooms(ws, f) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.rooms
      .filter((r) => r.workspaceId === ws && (!f.buildingId || r.buildingId === f.buildingId))
      .map((r) => toRoom(r))
      .filter((r) => (f.status ? r.status === f.status : r.status !== 'ARCHIVED'))
      .filter((r) => includesText(`${r.code} ${r.buildingName}`, f.q))
      .sort((a, b) => a.buildingName.localeCompare(b.buildingName) || a.code.localeCompare(b.code));
  },
  async getRoom(ws, id) {
    await simulate();
    requireMember(ws);
    return toRoom(findRoom(ws, id), true);
  },
  async createRoom(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const b = writableBuilding(ws, input.buildingId);
    if (codeTaken(b.id, input.code)) throw conflict('ROOM_CODE_CONFLICT', 'Room code already exists');
    const room: WsRoom = {
      id: nextId('room'),
      workspaceId: ws,
      buildingId: b.id,
      buildingName: b.name,
      code: input.code.trim(),
      floor: 1,
      area: Number(input.areaSqm),
      basePrice: Number(input.monthlyRent),
      maxOccupants: input.maxOccupants ?? 1,
      amenities: [],
      images: [],
      description: input.description ?? '',
      operationalStatus: 'VACANT',
      listingStatus: 'DRAFT',
      updatedAt: new Date().toISOString(),
    };
    db.rooms.push(room);
    if (input.status === 'UNAVAILABLE') unavailableRooms.add(room.id);
    audit(user.email, 'Tạo phòng', `${b.name} • ${room.code}`, 'WORKSPACE');
    return toRoom(room, true);
  },
  async updateRoom(ws, buildingId, id, patch) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, id);
    if (patch.code !== undefined) {
      if (codeTaken(buildingId, patch.code, id)) throw conflict('ROOM_CODE_CONFLICT', 'Room code already exists');
      room.code = patch.code;
    }
    if (patch.areaSqm !== undefined) room.area = Number(patch.areaSqm);
    if (patch.monthlyRent !== undefined) room.basePrice = Number(patch.monthlyRent);
    if (patch.maxOccupants !== undefined) room.maxOccupants = patch.maxOccupants;
    if (patch.description !== undefined) room.description = patch.description;
    if (patch.status) {
      if (room.operationalStatus === 'OCCUPIED') throw conflict('ROOM_ARCHIVED', 'Occupied room status is managed by contracts');
      if (patch.status === 'UNAVAILABLE') unavailableRooms.add(id);
      else unavailableRooms.delete(id);
    }
    room.updatedAt = new Date().toISOString();
    return toRoom(room, true);
  },
  async archiveRoom(ws, buildingId, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, id);
    if (room.operationalStatus === 'OCCUPIED') throw conflict('ROOM_ARCHIVED', 'Room has an active contract');
    archivedRooms.add(id);
    return toRoom(room, true);
  },
  async restoreRoom(ws, _buildingId, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = findRoom(ws, id);
    archivedRooms.delete(id);
    return toRoom(room, true);
  },

  async listAmenities(ws) {
    await simulate();
    requireMember(ws);
    return amenityCatalog(ws);
  },
  async createAmenity(ws, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    if (amenityCatalog(ws).some((a) => a.name.toLowerCase() === input.name.trim().toLowerCase())) {
      throw conflict('AMENITY_ALREADY_EXISTS', 'Amenity already exists');
    }
    const a: AmenityRef = { id: nextId('amn'), name: input.name.trim(), description: input.description };
    customAmenities.set(ws, [...(customAmenities.get(ws) ?? []), a]);
    return a;
  },
  async setRoomAmenity(ws, buildingId, roomId, amenityId, enabled) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, roomId);
    if (!amenityCatalog(ws).some((a) => a.id === amenityId)) notFound('Không tìm thấy tiện ích.');
    if ((Object.keys(AMENITY_LABELS) as string[]).includes(amenityId)) {
      const code = amenityId as AmenityCode;
      room.amenities = enabled ? [...new Set([...room.amenities, code])] : room.amenities.filter((c) => c !== code);
    } else {
      const set = customRoomAmenities.get(roomId) ?? new Set<string>();
      if (enabled) set.add(amenityId);
      else set.delete(amenityId);
      customRoomAmenities.set(roomId, set);
    }
  },

  async addRoomImage(ws, buildingId, roomId, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, roomId);
    room.images = [...room.images, input.url];
    if (input.altText) imageAlt.set(`${roomId}|${input.url}`, input.altText);
    return imagesOf(room).at(-1)!;
  },
  async reorderRoomImages(ws, buildingId, roomId, imageIds) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, roomId);
    const current = imagesOf(room);
    if (imageIds.length !== current.length || new Set(imageIds).size !== current.length || !imageIds.every((i) => current.some((c) => c.id === i))) {
      throw conflict('ROOM_IMAGE_ORDER_INVALID', 'Image order must list every image once');
    }
    room.images = imageIds.map((i) => current.find((c) => c.id === i)!.url);
    return imagesOf(room);
  },
  async deleteRoomImage(ws, buildingId, roomId, imageId) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, roomId);
    const found = imagesOf(room).find((i) => i.id === imageId);
    if (!found) notFound('Không tìm thấy ảnh.');
    room.images = room.images.filter((url) => url !== found!.url);
  },

  async setListing(ws, buildingId, roomId, published) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const room = writableRoom(ws, buildingId, roomId);
    room.listingStatus = published ? 'PUBLISHED' : 'HIDDEN';
    audit(user.email, published ? 'Đăng tin phòng' : 'Ẩn tin phòng', room.code, 'LISTING');
    return { id: room.id, published };
  },
};
