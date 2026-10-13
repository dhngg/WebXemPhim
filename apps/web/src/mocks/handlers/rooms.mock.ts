import type { RoomsApi } from '@/features/rooms/api';
import type { PublicRoom, RoomSearchParams } from '@/features/rooms/types';
import { rateForDate } from '@/features/billing/calc';
import { mockMarketplaceStats, mockRooms } from '../data/rooms';
import { db, TODAY } from '../db';
import { notFound, simulate } from '../mockUtils';
import { isListingRemoved } from './admin.mock';

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

/** Lọc + sắp xếp phía mock. Backend thật sẽ làm việc này; giữ thuần để dễ test. */
export function filterRooms(rooms: PublicRoom[], params: RoomSearchParams): PublicRoom[] {
  const q = params.q ? normalize(params.q.trim()) : '';
  const result = rooms.filter((room) => {
    if (q && !normalize(`${room.title} ${room.address} ${room.district}`).includes(q)) return false;
    if (params.district && room.district !== params.district) return false;
    if (params.priceMin !== undefined && room.price < params.priceMin) return false;
    if (params.priceMax !== undefined && room.price > params.priceMax) return false;
    if (params.areaMin !== undefined && room.area < params.areaMin) return false;
    if (params.occupants !== undefined && room.maxOccupants < params.occupants) return false;
    if (params.roomType && room.roomType !== params.roomType) return false;
    if (params.amenities?.length && !params.amenities.every((a) => room.amenities.includes(a))) return false;
    return true;
  });

  switch (params.sort) {
    case 'price_asc':
      return result.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return result.sort((a, b) => b.price - a.price);
    case 'newest':
      return result.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    default:
      // "Phù hợp nhất": ưu tiên phòng đã xác thực, sau đó mới nhất.
      return result.sort((a, b) => Number(b.verified) - Number(a.verified) || b.postedAt.localeCompare(a.postedAt));
  }
}

/**
 * Phòng của workspace đang ĐĂNG TIN và còn TRỐNG được hiển thị trên marketplace —
 * minh họa BR-08 (trạng thái đăng tin độc lập với trạng thái vận hành).
 */
function workspaceListings(): PublicRoom[] {
  return db.rooms
    .filter((r) => r.listingStatus === 'PUBLISHED' && r.operationalStatus === 'VACANT')
    .map((r) => {
      const b = db.buildings.find((x) => x.id === r.buildingId)!;
      const ws = db.settings[r.workspaceId];
      const rate = rateForDate(db.rates.filter((x) => x.workspaceId === r.workspaceId), TODAY);
      return {
        id: r.id,
        title: `${ws?.name ?? b.name} – Phòng ${r.code} (${b.name})`,
        buildingName: `${b.name} • ${ws?.name ?? ''}`,
        address: `${b.address}, ${b.ward}, ${b.district}`,
        ward: b.ward,
        district: b.district,
        city: b.city,
        roomType: r.maxOccupants >= 3 ? 'APARTMENT' : 'STANDARD',
        price: r.basePrice,
        area: r.area,
        maxOccupants: r.maxOccupants,
        floorLabel: `Tầng ${r.floor}`,
        amenities: r.amenities,
        images: r.images.length ? r.images : mockRooms[0]!.images,
        verified: true,
        availableCount: 1,
        highlight: rate ? `Điện ${rate.electricityPerKwh / 1000}k • Nước ${rate.waterPerPerson / 1000}k` : undefined,
        deposit: r.basePrice,
        fees: {
          electricityPerKwh: rate?.electricityPerKwh ?? 0,
          waterPerPerson: rate?.waterPerPerson ?? 0,
          internet: rate?.internet ?? 0,
          service: rate?.sanitation ?? 0,
        },
        description: r.description,
        lat: b.lat ?? 10.8,
        lng: b.lng ?? 106.7,
        landlord: {
          name: ws?.contactName ?? 'Chủ trọ',
          phoneMasked: ws ? `${ws.contactPhone.slice(0, 4)} *** ${ws.contactPhone.slice(-3)}` : '—',
          verified: true,
          responseRate: 0.95,
          memberSince: b.createdAt,
        },
        postedAt: r.updatedAt,
      } satisfies PublicRoom;
    });
}

function allPublicRooms(): PublicRoom[] {
  return [...mockRooms, ...workspaceListings()].filter((r) => !isListingRemoved(r.id));
}

export const roomsMock: RoomsApi = {
  async search(params) {
    const { empty } = await simulate();
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 6;
    const all = empty ? [] : filterRooms(allPublicRooms(), params);
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  },

  async getById(roomId) {
    await simulate();
    return allPublicRooms().find((r) => r.id === roomId) ?? notFound('Phòng không tồn tại hoặc đã ngừng đăng tin.');
  },

  async getFeatured() {
    const { empty } = await simulate();
    return empty ? [] : allPublicRooms().filter((r) => r.verified).slice(0, 4);
  },

  async getStats() {
    await simulate();
    return mockMarketplaceStats;
  },

  async getDistricts() {
    await simulate();
    const counts = new Map<string, number>();
    allPublicRooms().forEach((r) => counts.set(r.district, (counts.get(r.district) ?? 0) + 1));
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  },
};
