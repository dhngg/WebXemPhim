export type AccountLinkStatus = 'UNLINKED' | 'PENDING' | 'LINKED';

export interface Tenant {
  id: string;
  workspaceId: string;
  fullName: string;
  phone: string;
  email?: string;
  idNumber?: string;
  dateOfBirth?: string;
  hometown?: string;
  note?: string;
  /** Không tự liên kết theo SĐT (BR-07) — chỉ qua yêu cầu có xác minh. */
  accountLinkStatus: AccountLinkStatus;
  createdAt: string;
}

export type TenantInput = Pick<Tenant, 'fullName' | 'phone' | 'email' | 'idNumber' | 'dateOfBirth' | 'hometown' | 'note'>;

export type ContractStatus = 'DRAFT' | 'ACTIVE' | 'ENDED' | 'TERMINATED';
export type WaterMode = 'PER_PERSON' | 'METER';

export interface ContractHistoryEntry {
  at: string;
  action: string;
  by: string;
}

export interface Contract {
  id: string;
  workspaceId: string;
  code: string;
  roomId: string;
  roomCode: string;
  buildingName: string;
  primaryTenantId: string;
  primaryTenantName: string;
  /** Người ở cùng (bao gồm người đứng tên). */
  occupantIds: string[];
  /** yyyy-MM-dd */
  startDate: string;
  /** yyyy-MM-dd — NGÀY KẾT THÚC TÍNH BAO GỒM (BR-01). */
  endDate: string;
  monthlyRent: number;
  deposit: number;
  waterMode: WaterMode;
  status: ContractStatus;
  note?: string;
  history: ContractHistoryEntry[];
  createdAt: string;
}

export interface ContractInput {
  roomId: string;
  primaryTenantId: string;
  occupantIds: string[];
  startDate: string;
  endDate: string;
  monthlyRent: number;
  deposit: number;
  waterMode: WaterMode;
  note?: string;
}

export type VehicleType = 'MOTORBIKE' | 'EBIKE' | 'BICYCLE' | 'CAR';

export interface Vehicle {
  id: string;
  workspaceId: string;
  tenantId: string;
  tenantName: string;
  roomCode: string;
  type: VehicleType;
  plate: string;
  brand: string;
  monthlyFee: number;
}

export type VehicleInput = Pick<Vehicle, 'tenantId' | 'type' | 'plate' | 'brand' | 'monthlyFee'>;
