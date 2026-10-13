import type { AmenityCode, RoomSort, RoomType } from './types';

export const AMENITY_LABELS: Record<AmenityCode, string> = {
  AIR_CON: 'Điều hòa',
  PRIVATE_WC: 'WC riêng',
  WASHER: 'Máy giặt riêng',
  FRIDGE: 'Tủ lạnh',
  BALCONY: 'Ban công',
  WINDOW: 'Cửa sổ trời',
  ELEVATOR: 'Thang máy',
  PARKING: 'Hầm để xe',
  SECURITY_24H: 'Bảo vệ 24/7',
  FREE_HOURS: 'Giờ giấc tự do',
  PET_ALLOWED: 'Cho nuôi mèo',
  WIFI: 'Internet cáp quang',
  KITCHEN: 'Bếp riêng',
  FURNISHED: 'Full nội thất',
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = {
  STUDIO: 'Phòng Studio',
  DUPLEX: 'Căn hộ Duplex',
  SHARED: 'Ở ghép',
  APARTMENT: 'Căn hộ dịch vụ',
  STANDARD: 'Phòng trọ thường',
};

export const SORT_LABELS: Record<RoomSort, string> = {
  relevant: 'Phù hợp nhất',
  price_asc: 'Giá thấp đến cao',
  price_desc: 'Giá cao đến thấp',
  newest: 'Mới đăng',
};

export interface PriceRange {
  key: string;
  label: string;
  min?: number;
  max?: number;
}

export const PRICE_RANGES: PriceRange[] = [
  { key: 'lt3', label: 'Dưới 3 triệu', max: 3_000_000 },
  { key: '3-5', label: '3 - 5 triệu', min: 3_000_000, max: 5_000_000 },
  { key: '5-7', label: '5 - 7 triệu', min: 5_000_000, max: 7_000_000 },
  { key: 'gt7', label: 'Trên 7 triệu', min: 7_000_000 },
];

/** Bộ lọc nhanh dạng chip (ảnh demo 2). Mỗi chip ánh xạ sang tham số tìm kiếm. */
export const QUICK_FILTERS: Array<{ key: string; label: string; amenity?: AmenityCode; roomType?: RoomType }> = [
  { key: 'balcony', label: 'Ban công thoáng mát', amenity: 'BALCONY' },
  { key: 'pet', label: 'Nuôi thú cưng', amenity: 'PET_ALLOWED' },
  { key: 'free', label: 'Giờ giấc tự do (Khóa vân tay)', amenity: 'FREE_HOURS' },
  { key: 'washer', label: 'Có máy giặt riêng', amenity: 'WASHER' },
  { key: 'shared', label: 'Không chung chủ', roomType: 'APARTMENT' },
];
