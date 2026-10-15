import { contractPhase } from '@rental/shared';
import type { TenancyApi } from '@/features/tenancy/api';
import { normalizePhone, normalizePlate } from '@/features/tenancy/mappers';
import type { LinkRequestItem, ManagedVehicle, TenancyContract, TenantAccountLink, TenantProfile } from '@/features/tenancy/types';
import type { Contract, Tenant, Vehicle, VehicleType } from '@/features/leasing/types';
import { ApiError } from '@/services/http/ApiError';
import { todayVN } from '@/lib/dates';
import { audit, db, nextId } from '../db';
import { mockUsers } from '../data/users';
import { requireMember } from '../guard';
import { registerInvitation } from '../tenant-links';
import { simulate } from '../mockUtils';
import { leasingMock } from './leasing.mock';

/**
 * Mock theo đúng hình dạng và quy tắc của backend V1 (P05/P06): chỉ OWNER; hợp đồng chỉ ACTIVE → ENDED;
 * phương tiện chỉ ngừng (không xóa). Dữ liệu nền dùng chung `db` với các màn Billing/Cổng người thuê.
 */
const archivedTenants = new Set<string>();
const stoppedVehicles = new Map<string, { at: string; reason?: string }>();
const endedAt = new Map<string, string>();
/** Thời điểm kết thúc hợp đồng đã ghi nhận (cho Cổng người thuê suy ra pha ENDED/CANCELLED). */
export const endedAtOf = (contractId: string): string | null => endedAt.get(contractId) ?? null;
// Trường xe mà mô hình mock cũ không có (model/màu/ghi chú).
const vehicleExtra = new Map<string, { model?: string; color?: string; notes?: string }>();

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};

const findTenant = (ws: string, id: string) =>
  db.tenants.find((t) => t.workspaceId === ws && t.id === id) ?? fail(404, 'TENANT_NOT_FOUND', 'Tenant not found');
const findContract = (ws: string, id: string) =>
  db.contracts.find((c) => c.workspaceId === ws && c.id === id && c.status !== 'DRAFT') ?? fail(404, 'CONTRACT_NOT_FOUND', 'Contract not found');
const findVehicle = (ws: string, id: string) =>
  db.vehicles.find((v) => v.workspaceId === ws && v.id === id) ?? fail(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');

const tenantOf = (t: Tenant): TenantProfile => ({
  id: t.id,
  workspaceId: t.workspaceId,
  fullName: t.fullName,
  phone: t.phone || undefined,
  email: t.email,
  dateOfBirth: t.dateOfBirth,
  address: t.hometown,
  notes: t.note,
  status: archivedTenants.has(t.id) ? 'ARCHIVED' : 'ACTIVE',
  createdAt: t.createdAt,
  updatedAt: t.createdAt,
});

const contractOf = (c: Contract): TenancyContract => {
  const room = db.rooms.find((r) => r.id === c.roomId);
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    roomId: c.roomId,
    roomCode: c.roomCode,
    buildingId: room?.buildingId ?? '',
    buildingName: c.buildingName,
    tenantId: c.primaryTenantId,
    tenantName: c.primaryTenantName,
    startDate: c.startDate,
    endDate: c.endDate,
    monthlyRent: String(c.monthlyRent),
    status: c.status === 'ACTIVE' ? 'ACTIVE' : 'ENDED',
    phase: contractPhase(
      { status: c.status === 'ACTIVE' ? 'ACTIVE' : 'ENDED', startDate: c.startDate, endDate: c.endDate, endedAt: endedAt.get(c.id) ?? null },
      todayVN(),
    ),
    notes: c.note,
    endedAt: endedAt.get(c.id),
    createdAt: c.createdAt,
    updatedAt: c.createdAt,
  };
};

const vehicleOf = (v: Vehicle): ManagedVehicle => {
  const stop = stoppedVehicles.get(v.id);
  return {
    id: v.id,
    workspaceId: v.workspaceId,
    tenantId: v.tenantId,
    tenantName: v.tenantName,
    licensePlate: normalizePlate(v.plate),
    vehicleType: v.type,
    brand: v.brand || undefined,
    ...vehicleExtra.get(v.id),
    status: stop ? 'INACTIVE' : 'ACTIVE',
    inactiveAt: stop?.at,
    inactiveReason: stop?.reason,
    createdAt: new Date().toISOString(),
  };
};

const clean = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? undefined : v);

/** Giống backend: hợp đồng có thể bắt đầu trong tương lai nhưng không được đã quá hạn (ngày kết thúc tính bao gồm). */
function checkPeriod(startDate: string, endDate: string) {
  if (startDate > endDate || endDate < todayVN()) fail(409, 'CONTRACT_NOT_ELIGIBLE', 'Contract period is not eligible');
}

/** Hai hợp đồng ACTIVE của một phòng không được giao nhau (tính bao gồm hai đầu). */
const overlaps = (roomId: string, startDate: string, endDate: string, exceptId?: string) =>
  db.contracts.some((c) => c.roomId === roomId && c.id !== exceptId && c.status === 'ACTIVE' && c.startDate <= endDate && startDate <= c.endDate);

/** Phòng chỉ OCCUPIED khi có hợp đồng ACTIVE đã bắt đầu (kể cả quá hạn chưa kết thúc). */
const hasStartedActive = (roomId: string, exceptId?: string) =>
  db.contracts.some((c) => c.roomId === roomId && c.id !== exceptId && c.status === 'ACTIVE' && c.startDate <= todayVN());

export const tenancyMock: TenancyApi = {
  async listTenants(ws, f = {}) {
    const { empty } = await simulate();
    requireMember(ws, 'rooms.write');
    if (empty) return [];
    return db.tenants
      .filter((t) => t.workspaceId === ws)
      .map(tenantOf)
      .filter((t) => !f.status || t.status === f.status)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  },
  async getTenant(ws, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    return tenantOf(findTenant(ws, id));
  },
  async createTenant(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const t: Tenant = {
      id: nextId('ten'),
      workspaceId: ws,
      fullName: input.fullName.trim(),
      phone: input.phone ? normalizePhone(input.phone) : '',
      email: clean(input.email),
      dateOfBirth: clean(input.dateOfBirth),
      hometown: clean(input.address),
      note: clean(input.notes),
      accountLinkStatus: 'UNLINKED',
      createdAt: new Date().toISOString(),
    };
    db.tenants.push(t);
    audit(user.email, 'Tạo hồ sơ người thuê', t.fullName, 'WORKSPACE');
    return tenantOf(t);
  },
  async updateTenant(ws, id, patch) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const t = findTenant(ws, id);
    if (archivedTenants.has(id)) fail(409, 'TENANT_ARCHIVED', 'Tenant is archived');
    if (patch.fullName !== undefined) t.fullName = patch.fullName;
    if (patch.phone !== undefined) t.phone = patch.phone ?? '';
    if (patch.email !== undefined) t.email = clean(patch.email);
    if (patch.dateOfBirth !== undefined) t.dateOfBirth = clean(patch.dateOfBirth);
    if (patch.address !== undefined) t.hometown = clean(patch.address);
    if (patch.notes !== undefined) t.note = clean(patch.notes);
    db.contracts.filter((c) => c.primaryTenantId === id).forEach((c) => (c.primaryTenantName = t.fullName));
    return tenantOf(t);
  },
  async archiveTenant(ws, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const t = findTenant(ws, id);
    if (db.contracts.some((c) => c.status === 'ACTIVE' && c.occupantIds.includes(id))) {
      fail(409, 'TENANT_HAS_ACTIVE_CONTRACT', 'Tenant has an active contract');
    }
    archivedTenants.add(id);
    return tenantOf(t);
  },
  async restoreTenant(ws, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const t = findTenant(ws, id);
    archivedTenants.delete(id);
    return tenantOf(t);
  },

  async listLinkRequests(ws, f = {}) {
    await simulate();
    requireMember(ws, 'rooms.write');
    if (f.status && f.status !== 'PENDING') return [];
    return db.tenants
      .filter((t) => t.workspaceId === ws && db.pendingLinks[t.id])
      .map((t): LinkRequestItem => {
        const account = mockUsers.find((u) => u.user.id === db.pendingLinks[t.id]);
        return {
          id: `lnk-${t.id}`,
          tenantId: t.id,
          tenantName: t.fullName,
          requesterEmail: account?.user.email ?? '',
          requesterName: account?.user.fullName,
          status: 'PENDING',
          createdAt: t.createdAt,
        };
      });
  },
  async decideLinkRequest(ws, requestId, approve) {
    const tenantId = requestId.replace(/^lnk-/, '');
    await leasingMock.reviewLinkRequest(ws, tenantId, approve);
  },

  async listActiveLinks(ws, tenantId) {
    await simulate();
    requireMember(ws, 'rooms.write');
    findTenant(ws, tenantId);
    return Object.entries(db.tenantLinks)
      .filter(([, linkedTenantId]) => linkedTenantId === tenantId)
      .map(([userId]): TenantAccountLink => {
        const account = mockUsers.find((u) => u.user.id === userId);
        return {
          id: `lnk-user-${userId}`,
          tenantId,
          userId,
          userEmail: account?.user.email ?? '',
          userName: account?.user.fullName,
          linkedAt: findTenant(ws, tenantId).createdAt,
        };
      });
  },
  async revokeLink(ws, linkId) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const userId = linkId.replace(/^lnk-user-/, '');
    const tenantId = db.tenantLinks[userId];
    if (!tenantId) return fail(404, 'TENANT_LINK_NOT_FOUND', 'Tenant link not found');
    const tenant = findTenant(ws, tenantId);
    delete db.tenantLinks[userId];
    tenant.accountLinkStatus = 'UNLINKED';
    const account = mockUsers.find((u) => u.user.id === userId);
    if (account) account.user = { ...account.user, tenantLinked: false };
  },
  async createInvitation(ws, tenantId) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const tenant = findTenant(ws, tenantId);
    if (archivedTenants.has(tenant.id)) fail(404, 'TENANT_NOT_FOUND', 'Tenant not found');
    if (Object.values(db.tenantLinks).includes(tenantId)) fail(409, 'TENANT_INVITATION_CONFLICT', 'A link already exists');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const token = Array.from({ length: 43 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    registerInvitation(token, tenantId, expiresAt);
    return { token, expiresAt };
  },

  async listContracts(ws, f = {}) {
    const { empty } = await simulate();
    requireMember(ws, 'rooms.write');
    if (empty) return [];
    return db.contracts
      .filter((c) => c.workspaceId === ws && c.status !== 'DRAFT')
      .map(contractOf)
      .filter((c) => !f.status || c.status === f.status)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
  async getContract(ws, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    return contractOf(findContract(ws, id));
  },
  async createContract(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const room = db.rooms.find((r) => r.workspaceId === ws && r.id === input.roomId) ?? fail(404, 'ROOM_NOT_FOUND', 'Room not found');
    const tenant = findTenant(ws, input.tenantId);
    if (archivedTenants.has(tenant.id)) fail(409, 'TENANT_ARCHIVED', 'Tenant is archived');
    checkPeriod(input.startDate, input.endDate);
    if (room.operationalStatus !== 'VACANT' && room.operationalStatus !== 'OCCUPIED') fail(409, 'CONTRACT_NOT_ELIGIBLE', 'Room is not available');
    if (overlaps(room.id, input.startDate, input.endDate)) fail(409, 'CONTRACT_CONFLICT', 'Room already has a contract in this period');
    const now = new Date().toISOString();
    const c: Contract = {
      id: nextId('ctr'),
      workspaceId: ws,
      code: `HĐ-${1100 + db.contracts.length}`,
      roomId: room.id,
      roomCode: room.code,
      buildingName: room.buildingName,
      primaryTenantId: tenant.id,
      primaryTenantName: tenant.fullName,
      occupantIds: [tenant.id],
      startDate: input.startDate,
      endDate: input.endDate,
      monthlyRent: Number(input.monthlyRent),
      deposit: 0,
      waterMode: 'PER_PERSON',
      status: 'ACTIVE',
      note: clean(input.notes),
      history: [{ at: now, action: 'Tạo hợp đồng', by: user.fullName }],
      createdAt: now,
    };
    db.contracts.push(c);
    // Hợp đồng tương lai chỉ giữ chỗ cho kỳ thuê đã đăng ký, không đánh dấu phòng đã có người ở.
    if (c.startDate <= todayVN()) room.operationalStatus = 'OCCUPIED';
    audit(user.email, 'Tạo hợp đồng', c.code, 'WORKSPACE');
    return contractOf(c);
  },
  async updateContract(ws, id, patch) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const c = findContract(ws, id);
    if (c.status !== 'ACTIVE') fail(409, 'CONTRACT_INVALID_TRANSITION', 'Only ACTIVE contracts can be changed');
    const startDate = patch.startDate ?? c.startDate;
    const endDate = patch.endDate ?? c.endDate;
    checkPeriod(startDate, endDate);
    if (c.startDate <= todayVN() && startDate > todayVN()) fail(409, 'CONTRACT_NOT_ELIGIBLE', 'A started contract cannot be moved to the future');
    if (overlaps(c.roomId, startDate, endDate, c.id)) fail(409, 'CONTRACT_CONFLICT', 'Room already has a contract in this period');
    c.startDate = startDate;
    c.endDate = endDate;
    const room = db.rooms.find((r) => r.id === c.roomId);
    if (room && startDate <= todayVN() && room.operationalStatus === 'VACANT') room.operationalStatus = 'OCCUPIED';
    if (patch.monthlyRent !== undefined) c.monthlyRent = Number(patch.monthlyRent);
    if (patch.notes !== undefined) c.note = clean(patch.notes);
    return contractOf(c);
  },
  async endContract(ws, id, endDate?) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const c = findContract(ws, id);
    if (c.status !== 'ACTIVE') fail(409, 'CONTRACT_INVALID_TRANSITION', 'Only ACTIVE contracts can be ended');
    if (c.startDate > todayVN()) {
      // Hủy trước ngày bắt đầu: giữ nguyên kỳ thuê đã đăng ký, không đụng phòng, không đụng tiền cọc.
      if (endDate !== undefined) fail(409, 'CONTRACT_NOT_ELIGIBLE', 'A contract that has not started can only be cancelled');
      c.status = 'ENDED';
      endedAt.set(c.id, new Date().toISOString());
      return contractOf(c);
    }
    if (endDate === undefined) fail(400, 'VALIDATION_ERROR', 'endDate is required for a contract that has started');
    if (endDate! < c.startDate || endDate! > todayVN()) fail(409, 'CONTRACT_NOT_ELIGIBLE', 'End date is not eligible');
    c.status = 'ENDED';
    c.endDate = endDate!;
    endedAt.set(c.id, new Date().toISOString());
    const room = db.rooms.find((r) => r.id === c.roomId);
    // Không trả phòng về Trống nếu còn hợp đồng khác đang có hiệu lực.
    if (room && room.operationalStatus === 'OCCUPIED' && !hasStartedActive(c.roomId, c.id)) room.operationalStatus = 'VACANT';
    return contractOf(c);
  },

  async listVehicles(ws, f = {}) {
    const { empty } = await simulate();
    requireMember(ws, 'rooms.write');
    if (empty) return [];
    return db.vehicles
      .filter((v) => v.workspaceId === ws)
      .map(vehicleOf)
      .filter((v) => !f.status || v.status === f.status)
      .sort((a, b) => a.licensePlate.localeCompare(b.licensePlate));
  },
  async createVehicle(ws, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const tenant = findTenant(ws, input.tenantId);
    if (archivedTenants.has(tenant.id)) fail(409, 'VEHICLE_NOT_ELIGIBLE', 'Tenant is archived');
    const plate = normalizePlate(input.licensePlate);
    if (db.vehicles.some((v) => v.workspaceId === ws && normalizePlate(v.plate) === plate)) fail(409, 'VEHICLE_ALREADY_EXISTS', 'Vehicle already exists');
    const contract = db.contracts.find((c) => c.status === 'ACTIVE' && c.occupantIds.includes(tenant.id));
    const v: Vehicle = {
      id: nextId('veh'),
      workspaceId: ws,
      tenantId: tenant.id,
      tenantName: tenant.fullName,
      roomCode: contract?.roomCode ?? '',
      type: input.vehicleType as VehicleType,
      plate,
      brand: input.brand ?? '',
      monthlyFee: 0,
    };
    db.vehicles.push(v);
    vehicleExtra.set(v.id, { model: clean(input.model), color: clean(input.color), notes: clean(input.notes) });
    return vehicleOf(v);
  },
  async updateVehicle(ws, id, patch) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const v = findVehicle(ws, id);
    if (stoppedVehicles.has(id)) fail(409, 'VEHICLE_INACTIVE', 'Vehicle is inactive');
    if (patch.licensePlate !== undefined) {
      const plate = normalizePlate(patch.licensePlate);
      if (db.vehicles.some((x) => x.id !== id && x.workspaceId === ws && normalizePlate(x.plate) === plate)) fail(409, 'VEHICLE_ALREADY_EXISTS', 'Vehicle already exists');
      v.plate = plate;
    }
    if (patch.vehicleType !== undefined) v.type = patch.vehicleType as VehicleType;
    if (patch.brand !== undefined) v.brand = patch.brand ?? '';
    const extra = { ...vehicleExtra.get(id) };
    if (patch.model !== undefined) extra.model = clean(patch.model);
    if (patch.color !== undefined) extra.color = clean(patch.color);
    if (patch.notes !== undefined) extra.notes = clean(patch.notes);
    vehicleExtra.set(id, extra);
    return vehicleOf(v);
  },
  async stopVehicle(ws, id, reason) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const v = findVehicle(ws, id);
    if (!stoppedVehicles.has(id)) stoppedVehicles.set(id, { at: new Date().toISOString(), reason });
    return vehicleOf(v);
  },
};
