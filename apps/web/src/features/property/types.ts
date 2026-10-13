import type { AmenityCode } from '@/features/rooms/types';

export interface Building {
  id: string;
  workspaceId: string;
  name: string;
  address: string;
  ward: string;
  district: string;
  city: string;
  lat?: number;
  lng?: number;
  floors: number;
  note?: string;
  createdAt: string;
}

export interface BuildingWithStats extends Building {
  roomCount: number;
  occupiedCount: number;
}

export type BuildingInput = Pick<Building, 'name' | 'address' | 'ward' | 'district' | 'city' | 'floors' | 'note' | 'lat' | 'lng'>;

/** Trạng thái vận hành — độc lập với trạng thái đăng tin (BR-08). */
export type OperationalStatus = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
/** Trạng thái đăng tin trên marketplace. */
export type ListingStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';

export interface WsRoom {
  id: string;
  workspaceId: string;
  buildingId: string;
  buildingName: string;
  code: string;
  floor: number;
  area: number;
  basePrice: number;
  maxOccupants: number;
  amenities: AmenityCode[];
  images: string[];
  description: string;
  operationalStatus: OperationalStatus;
  listingStatus: ListingStatus;
  updatedAt: string;
}

export type WsRoomInput = Pick<
  WsRoom,
  'buildingId' | 'code' | 'floor' | 'area' | 'basePrice' | 'maxOccupants' | 'amenities' | 'images' | 'description' | 'listingStatus'
> & { operationalStatus?: OperationalStatus };

export interface WsRoomFilters {
  q?: string;
  buildingId?: string;
  operationalStatus?: OperationalStatus;
  listingStatus?: ListingStatus;
}

export type WsViewingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

export interface WsViewing {
  id: string;
  workspaceId: string;
  roomId: string;
  roomCode: string;
  buildingName: string;
  visitorName: string;
  visitorPhone: string;
  scheduledAt: string;
  status: WsViewingStatus;
  note?: string;
}
