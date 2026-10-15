import type { Paginated } from '@/types/api';

export type RoomType = 'STUDIO' | 'DUPLEX' | 'SHARED' | 'APARTMENT' | 'STANDARD';

export type AmenityCode =
  | 'AIR_CON'
  | 'PRIVATE_WC'
  | 'WASHER'
  | 'FRIDGE'
  | 'BALCONY'
  | 'WINDOW'
  | 'ELEVATOR'
  | 'PARKING'
  | 'SECURITY_24H'
  | 'FREE_HOURS'
  | 'PET_ALLOWED'
  | 'WIFI'
  | 'KITCHEN'
  | 'FURNISHED';

export interface RoomFees {
  /** đ/kWh */
  electricityPerKwh: number;
  /** đ/người/tháng (chế độ theo người) */
  waterPerPerson: number;
  internet: number;
  service: number;
}

export interface PublicRoom {
  /** Public listing ID. This is the ID used by public routes and viewing requests. */
  id: string;
  roomId?: string;
  title: string;
  buildingName: string;
  address: string;
  /** Số nhà/đường (backend: `building.addressLine1`). Có thì địa chỉ đủ rõ để mở Google Maps. */
  streetAddress?: string;
  ward: string;
  district: string;
  city: string;
  roomType?: RoomType;
  price: number;
  area: number;
  maxOccupants: number;
  floorLabel?: string;
  amenities: Array<AmenityCode | { id: string; name: string }>;
  images: string[];
  verified?: boolean;
  availableCount?: number;
  highlight?: string;
  deposit?: number;
  fees?: RoomFees;
  description: string | null;
  lat?: number;
  lng?: number;
  landlord?: {
    name: string;
    phoneMasked: string;
    verified: boolean;
    responseRate: number;
    memberSince: string;
  };
  postedAt: string;
}

/** Đúng các tham số `GET /listings` hỗ trợ (backend lọc city/district/ward theo “chứa”, giá gồm hai đầu). */
export interface RoomSearchParams {
  city?: string;
  district?: string;
  ward?: string;
  minPrice?: number;
  maxPrice?: number;
  amenityIds?: string[];
  page?: number;
  limit?: number;
}

export type RoomSearchResult = Paginated<PublicRoom>;
