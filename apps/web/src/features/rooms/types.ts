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
  id: string;
  title: string;
  buildingName: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  roomType: RoomType;
  price: number;
  area: number;
  maxOccupants: number;
  floorLabel: string;
  amenities: AmenityCode[];
  images: string[];
  verified: boolean;
  availableCount: number;
  highlight?: string;
  deposit: number;
  fees: RoomFees;
  description: string;
  lat: number;
  lng: number;
  landlord: {
    name: string;
    phoneMasked: string;
    verified: boolean;
    responseRate: number;
    memberSince: string;
  };
  postedAt: string;
}

export type RoomSort = 'relevant' | 'price_asc' | 'price_desc' | 'newest';

export interface RoomSearchParams {
  q?: string;
  district?: string;
  priceMin?: number;
  priceMax?: number;
  areaMin?: number;
  occupants?: number;
  roomType?: RoomType;
  amenities?: AmenityCode[];
  sort?: RoomSort;
  page?: number;
  pageSize?: number;
}

export type RoomSearchResult = Paginated<PublicRoom>;

export interface MarketplaceStats {
  verifiedRooms: number;
  depositProtectedRatio: number;
  landlords: number;
}
