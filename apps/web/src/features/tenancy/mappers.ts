import { businessDateOf, contractPhase } from '@rental/shared';
import type {
  ContractResponse,
  TenantAccountLinkResponse,
  TenantLinkRequestResponse,
  TenantResponse,
  VehicleResponse,
} from '@rental/shared';
import { sameDecimal } from '@/features/property-management/mappers';
import type {
  ContractInput,
  ContractPatch,
  LinkInvitation,
  LinkRequestItem,
  ManagedVehicle,
  TenancyContract,
  TenantAccountLink,
  TenantInput,
  TenantPatch,
  TenantProfile,
  VehicleInput,
  VehiclePatch,
} from './types';

const opt = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? undefined : v);

// ------------------------------------------------------------------ chuẩn hóa (khớp backend)
/** Điện thoại: bỏ khoảng trắng, chấm, gạch nối, ngoặc. Backend cũng chuẩn hóa lại. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s.()-]/g, '');
}
/** Biển số: viết hoa, bỏ khoảng trắng, chấm, gạch nối (đúng DTO backend). */
export function normalizePlate(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}

// ------------------------------------------------------------------ backend → giao diện
export function toTenant(dto: TenantResponse): TenantProfile {
  return {
    id: dto.id,
    workspaceId: dto.workspaceId,
    fullName: dto.fullName,
    phone: opt(dto.phone),
    email: opt(dto.email),
    dateOfBirth: opt(dto.dateOfBirth),
    address: opt(dto.address),
    notes: opt(dto.notes),
    status: dto.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toLinkRequest(dto: TenantLinkRequestResponse): LinkRequestItem {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    tenantName: dto.tenant.fullName,
    requesterEmail: dto.requester.email,
    requesterName: opt(dto.requester.displayName),
    status: dto.status,
    message: opt(dto.message),
    decisionNote: opt(dto.decisionNote),
    createdAt: dto.createdAt,
  };
}

export function toAccountLink(dto: TenantAccountLinkResponse): TenantAccountLink {
  return {
    id: dto.id,
    tenantId: dto.tenantId,
    userId: dto.userId,
    userEmail: dto.user.email,
    userName: opt(dto.user.displayName),
    linkedAt: dto.linkedAt,
  };
}

export function toInvitation(dto: { token?: string; expiresAt: string }): LinkInvitation {
  if (!dto.token) throw new TypeError('Invitation response has no token');
  return { token: dto.token, expiresAt: dto.expiresAt };
}

export function toContract(dto: ContractResponse, buildingNames: ReadonlyMap<string, string> = new Map()): TenancyContract {
  return {
    id: dto.id,
    workspaceId: dto.workspaceId,
    roomId: dto.roomId,
    roomCode: dto.room.code,
    buildingId: dto.room.buildingId,
    buildingName: buildingNames.get(dto.room.buildingId),
    tenantId: dto.tenantId,
    tenantName: dto.tenant.fullName,
    startDate: dto.startDate,
    endDate: dto.endDate,
    monthlyRent: dto.monthlyRent,
    status: dto.status,
    // Backend tính theo ngày Asia/Ho_Chi_Minh; fallback cho phản hồi cũ chưa có `phase`.
    phase: dto.phase ?? contractPhase(dto, businessDateOf()),
    notes: opt(dto.notes),
    endedAt: opt(dto.endedAt),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export function toVehicle(dto: VehicleResponse): ManagedVehicle {
  return {
    id: dto.id,
    workspaceId: dto.workspaceId,
    tenantId: dto.tenantId,
    tenantName: dto.tenant.fullName,
    licensePlate: dto.licensePlate,
    vehicleType: dto.vehicleType,
    brand: opt(dto.brand),
    model: opt(dto.model),
    color: opt(dto.color),
    notes: opt(dto.notes),
    status: dto.status,
    inactiveAt: opt(dto.inactiveAt),
    inactiveReason: opt(dto.inactiveReason),
    createdAt: dto.createdAt,
  };
}

// ------------------------------------------------------------------ giao diện → backend
/** Body tạo: bỏ trường rỗng (backend không nhận chuỗi rỗng cho trường tùy chọn). */
export function toTenantBody(input: TenantInput) {
  const body: Record<string, string> = { fullName: input.fullName.trim() };
  if (input.phone?.trim()) body.phone = normalizePhone(input.phone.trim());
  if (input.email?.trim()) body.email = input.email.trim();
  if (input.dateOfBirth) body.dateOfBirth = input.dateOfBirth;
  if (input.address?.trim()) body.address = input.address.trim();
  if (input.notes?.trim()) body.notes = input.notes.trim();
  return body;
}

/** Giá trị ô tiền thuê trên form: số nguyên VND dùng ô nhập tiền; có phần lẻ thật thì giữ nguyên chuỗi, không ép Number. */
export function rentFormValue(rent: string): number | string {
  const n = Number(rent);
  return Number.isInteger(n) ? n : rent;
}

/** Chỉ gửi trường thay đổi; xóa giá trị tùy chọn bằng `null` (đúng API). */
export function diffTenant(current: TenantProfile, next: TenantInput): TenantPatch {
  const patch: TenantPatch = {};
  const name = next.fullName.trim();
  if (name !== current.fullName) patch.fullName = name;
  const field = (key: 'phone' | 'email' | 'dateOfBirth' | 'address' | 'notes', value: string | undefined) => {
    const before = current[key] ?? '';
    const after = key === 'phone' ? normalizePhone(value?.trim() ?? '') : (value?.trim() ?? '');
    if (after !== before) patch[key] = after === '' ? null : after;
  };
  field('phone', next.phone);
  field('email', next.email);
  field('dateOfBirth', next.dateOfBirth);
  field('address', next.address);
  field('notes', next.notes);
  return patch;
}

export function toContractBody(input: ContractInput) {
  return {
    roomId: input.roomId,
    tenantId: input.tenantId,
    startDate: input.startDate,
    endDate: input.endDate,
    monthlyRent: input.monthlyRent,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
}

/** Phòng và người thuê không đổi được sau khi tạo → chỉ so ngày, tiền và ghi chú. */
export function diffContract(current: TenancyContract, next: Omit<ContractInput, 'roomId' | 'tenantId'>): ContractPatch {
  const patch: ContractPatch = {};
  if (next.startDate !== current.startDate) patch.startDate = next.startDate;
  if (next.endDate !== current.endDate) patch.endDate = next.endDate;
  if (!sameDecimal(next.monthlyRent, current.monthlyRent)) patch.monthlyRent = next.monthlyRent;
  const notes = next.notes?.trim() ?? '';
  if (notes !== (current.notes ?? '')) patch.notes = notes === '' ? null : notes;
  return patch;
}

export function toVehicleBody(input: VehicleInput) {
  const body: Record<string, string> = {
    tenantId: input.tenantId,
    licensePlate: normalizePlate(input.licensePlate),
    vehicleType: input.vehicleType.trim(),
  };
  for (const key of ['brand', 'model', 'color', 'notes'] as const) {
    const v = input[key]?.trim();
    if (v) body[key] = v;
  }
  return body;
}

export function diffVehicle(current: ManagedVehicle, next: Omit<VehicleInput, 'tenantId'>): VehiclePatch {
  const patch: VehiclePatch = {};
  const plate = normalizePlate(next.licensePlate);
  if (plate !== current.licensePlate) patch.licensePlate = plate;
  const type = next.vehicleType.trim();
  if (type !== current.vehicleType) patch.vehicleType = type;
  for (const key of ['brand', 'model', 'color', 'notes'] as const) {
    const after = next[key]?.trim() ?? '';
    if (after !== (current[key] ?? '')) patch[key] = after === '' ? null : after;
  }
  return patch;
}

/**
 * Backend chỉ cho sửa hợp đồng ACTIVE chưa quá ngày kết thúc (UPCOMING hoặc IN_EFFECT).
 * Hợp đồng quá hạn (OVERDUE) chỉ còn thao tác kết thúc thủ công.
 */
export const canEditContract = (c: Pick<TenancyContract, 'status' | 'phase'>) =>
  c.status === 'ACTIVE' && (c.phase === 'UPCOMING' || c.phase === 'IN_EFFECT');

/** Hợp đồng ACTIVE của cùng phòng có giao nhau (tính bao gồm) với khoảng ngày đang nhập? Chỉ để cảnh báo; backend quyết định. */
export function overlappingContracts(
  contracts: Array<Pick<TenancyContract, 'id' | 'roomId' | 'startDate' | 'endDate' | 'status'>>,
  candidate: { id?: string; roomId: string; startDate: string; endDate: string },
) {
  return contracts.filter(
    (c) =>
      c.id !== candidate.id &&
      c.roomId === candidate.roomId &&
      c.status === 'ACTIVE' &&
      c.startDate <= candidate.endDate &&
      candidate.startDate <= c.endDate,
  );
}
