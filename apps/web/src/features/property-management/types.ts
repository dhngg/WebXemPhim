import type { ManageableRoomStatus, RoomStatus } from '@rental/shared';

export type { ManageableRoomStatus, RoomStatus };
export type BuildingStatus = 'ACTIVE' | 'ARCHIVED';

/** Tòa nhà quản lý (khớp BuildingResponse của backend). Số phòng/đang thuê được đếm từ danh sách phòng thật. */
export interface ManagedBuilding {
  id: string;
  workspaceId: string;
  name: string;
  address: string;
  addressLine2?: string;
  ward?: string;
  district?: string;
  city: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  description?: string;
  status: BuildingStatus;
  createdAt: string;
  roomCount: number;
  occupiedCount: number;
}

export interface BuildingInput {
  name: string;
  address: string;
  addressLine2?: string;
  ward?: string;
  district?: string;
  city: string;
  postalCode?: string;
  description?: string;
  lat?: number;
  lng?: number;
}
/** Chỉ gửi các trường đã đổi (backend PATCH từng phần). */
export type BuildingPatch = Partial<BuildingInput>;

export interface AmenityRef {
  id: string;
  name: string;
  description?: string;
}

export interface RoomImageItem {
  id: string;
  url: string;
  altText?: string;
  sortOrder: number;
}

/**
 * Phòng quản lý. Tiền và diện tích là CHUỖI thập phân đúng như backend trả (vd "3500000.00", "25.50")
 * để không bao giờ làm tròn sai; chỉ chuyển sang số khi cần hiển thị.
 */
export interface ManagedRoom {
  id: string;
  workspaceId: string;
  buildingId: string;
  buildingName: string;
  code: string;
  areaSqm: string;
  monthlyRent: string;
  maxOccupants: number;
  description: string;
  status: RoomStatus;
  archivedAt: string | null;
  amenities: AmenityRef[];
  /** Chỉ có ở chi tiết phòng (backend trả ảnh qua endpoint riêng). */
  images?: RoomImageItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RoomInput {
  buildingId: string;
  code: string;
  areaSqm: string;
  monthlyRent: string;
  maxOccupants?: number;
  description?: string;
  status?: ManageableRoomStatus;
}
export type RoomPatch = Partial<Omit<RoomInput, 'buildingId'>>;

export interface RoomFilters {
  q?: string;
  buildingId?: string;
  status?: RoomStatus;
}

export interface ListingResult {
  id: string;
  published: boolean;
}
