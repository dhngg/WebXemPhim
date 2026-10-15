/**
 * Mô hình quản lý người thuê / hợp đồng / phương tiện theo ĐÚNG API backend (P05, P06).
 * Tách khỏi `features/leasing` (mô hình mock cũ còn dùng cho Billing và Cổng người thuê).
 */
export type TenantStatus = 'ACTIVE' | 'ARCHIVED';

export interface TenantProfile {
  id: string;
  workspaceId: string;
  fullName: string;
  phone?: string;
  email?: string;
  /** yyyy-MM-dd */
  dateOfBirth?: string;
  address?: string;
  notes?: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantInput {
  fullName: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  notes?: string;
}

/** `null` = xóa giá trị tùy chọn (đúng API PATCH). */
export interface TenantPatch {
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  notes?: string | null;
}

export type LinkRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LinkRequestItem {
  id: string;
  tenantId: string;
  tenantName: string;
  requesterEmail: string;
  requesterName?: string;
  status: LinkRequestStatus;
  message?: string;
  decisionNote?: string;
  createdAt: string;
}

/** Liên kết tài khoản ACTIVE của hồ sơ người thuê; `id` dùng để thu hồi. */
export interface TenantAccountLink {
  id: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  linkedAt: string;
}

/** Lời mời liên kết: token CHỈ có ở response lúc tạo (backend không lưu token thô). */
export interface LinkInvitation {
  token: string;
  expiresAt: string;
}

export type ContractStatus = 'ACTIVE' | 'ENDED';

/**
 * Hiệu lực suy ra từ ngày (giờ Việt Nam), KHÔNG lưu ở backend: trạng thái lưu chỉ ACTIVE/ENDED.
 * Hợp đồng ACTIVE quá hạn không tự đóng — chủ nhà phải kết thúc thủ công.
 */
export type ContractPhase = 'UPCOMING' | 'IN_EFFECT' | 'OVERDUE' | 'ENDED' | 'CANCELLED';

export interface TenancyContract {
  id: string;
  workspaceId: string;
  roomId: string;
  roomCode: string;
  buildingId: string;
  /** Backend không trả tên tòa nhà trong hợp đồng → ghép từ danh sách tòa nhà (có thể vắng). */
  buildingName?: string;
  tenantId: string;
  tenantName: string;
  /** yyyy-MM-dd, ngày kết thúc tính bao gồm. */
  startDate: string;
  endDate: string;
  /** Chuỗi thập phân chính xác của backend (không làm tròn). */
  monthlyRent: string;
  status: ContractStatus;
  phase: ContractPhase;
  notes?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractInput {
  roomId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  notes?: string;
}

export interface ContractPatch {
  startDate?: string;
  endDate?: string;
  monthlyRent?: string;
  notes?: string | null;
}

export type VehicleStatus = 'ACTIVE' | 'INACTIVE';

export interface ManagedVehicle {
  id: string;
  workspaceId: string;
  tenantId: string;
  tenantName: string;
  licensePlate: string;
  /** Chuỗi mở (danh mục loại xe chưa được chốt). */
  vehicleType: string;
  brand?: string;
  model?: string;
  color?: string;
  notes?: string;
  status: VehicleStatus;
  inactiveAt?: string;
  inactiveReason?: string;
  createdAt: string;
}

export interface VehicleInput {
  tenantId: string;
  licensePlate: string;
  vehicleType: string;
  brand?: string;
  model?: string;
  color?: string;
  notes?: string;
}

export interface VehiclePatch {
  licensePlate?: string;
  vehicleType?: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  notes?: string | null;
}
