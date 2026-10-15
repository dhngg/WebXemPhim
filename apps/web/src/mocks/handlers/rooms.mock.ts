import type { RoomsApi } from '@/features/rooms/api';
import type { PublicRoom, RoomSearchParams } from '@/features/rooms/types';
import { rateForDate } from '@/features/billing/calc';
import { mockRooms } from '../data/rooms';
import { db, TODAY } from '../db';
import { notFound, simulate } from '../mockUtils';
import { isListingRemoved } from './admin.mock';

const contains = (value: string, needle: string) => value.toLowerCase().includes(needle.trim().toLowerCase());

/**
 * Lọc + sắp xếp đúng như `GET /listings`: thành phố/quận/phường là “chứa, không phân biệt hoa thường”, khoảng giá gồm hai đầu,
 * tiện ích phải có đủ tất cả, mới đăng trước. Không có tìm theo từ khóa, loại phòng, diện tích hay sắp xếp khác.
 */
export function filterRooms(rooms: PublicRoom[], params: RoomSearchParams): PublicRoom[] {
  return rooms
    .filter((room) => {
      if (params.city && !contains(room.city, params.city)) return false;
      if (params.district && !contains(room.district, params.district)) return false;
      if (params.ward && !contains(room.ward, params.ward)) return false;
      if (params.minPrice !== undefined && room.price < params.minPrice) return false;
      if (params.maxPrice !== undefined && room.price > params.maxPrice) return false;
      if (params.amenityIds?.length && !params.amenityIds.every((id) => room.amenities.some((item) => typeof item !== 'string' && item.id === id))) return false;
      return true;
    })
    .sort((a, b) => b.postedAt.localeCompare(a.postedAt) || b.id.localeCompare(a.id));
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
        lat: b.lat ?? 21.03,
        lng: b.lng ?? 105.82,
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
  return [...mockRooms, ...workspaceListings()]
    .filter((r) => !isListingRemoved(r.id))
    .map((r) => ({ ...r, streetAddress: r.streetAddress ?? r.address.split(',')[0]?.trim() }));
}

export const roomsMock: RoomsApi = {
  async search(params) {
    const { empty } = await simulate();
    const page = params.page ?? 1;
    const pageSize = params.limit ?? 20;
    const all = empty ? [] : filterRooms(allPublicRooms(), params);
    return { items: all.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: all.length };
  },

  async getByListingId(listingId) {
    await simulate();
    return allPublicRooms().find((r) => r.id === listingId) ?? notFound('Phòng không tồn tại hoặc đã ngừng đăng tin.');
  },

  async getById(listingId) {
    await simulate();
    return allPublicRooms().find((r) => r.id === listingId) ?? notFound('Phòng không tồn tại hoặc đã ngừng đăng tin.');
  },
};
