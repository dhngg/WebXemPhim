import type { LeasingApi } from '@/features/leasing/api';
import type { Contract, ContractInput, Tenant } from '@/features/leasing/types';
import { findOverlappingContracts } from '@/features/billing/calc';
import { formatDate } from '@/lib/format';
import { audit, db, nextId } from '../db';
import { mockUsers } from '../data/users';
import { conflict, includesText, requireMember, validation } from '../guard';
import { notFound, simulate } from '../mockUtils';

const findTenant = (ws: string, id: string) =>
  db.tenants.find((t) => t.workspaceId === ws && t.id === id) ?? notFound('Không tìm thấy người thuê.');
const findContract = (ws: string, id: string) =>
  db.contracts.find((c) => c.workspaceId === ws && c.id === id) ?? notFound('Không tìm thấy hợp đồng.');

function validateContract(ws: string, input: ContractInput) {
  const errors: Record<string, string> = {};
  if (!input.startDate) errors.startDate = 'Bắt buộc nhập ngày bắt đầu';
  if (!input.endDate) errors.endDate = 'Bắt buộc nhập ngày kết thúc';
  if (input.startDate && input.endDate && input.endDate < input.startDate) errors.endDate = 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu';
  if (Object.keys(errors).length) validation('Thông tin hợp đồng không hợp lệ.', errors);
  const room = db.rooms.find((r) => r.workspaceId === ws && r.id === input.roomId) ?? notFound('Phòng không tồn tại.');
  const tenant = findTenant(ws, input.primaryTenantId);
  return { room, tenant };
}

export const leasingMock: LeasingApi = {
  async listTenants(ws, f) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.tenants
      .filter(
        (t) =>
          t.workspaceId === ws &&
          (!f.linkStatus || t.accountLinkStatus === f.linkStatus) &&
          includesText(`${t.fullName} ${t.phone} ${t.email ?? ''}`, f.q),
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
  },
  async getTenant(ws, id) {
    await simulate();
    requireMember(ws);
    return findTenant(ws, id);
  },
  async createTenant(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    // BR-07: KHÔNG tự liên kết với User dù trùng số điện thoại.
    const t: Tenant = { ...input, id: nextId('ten'), workspaceId: ws, accountLinkStatus: 'UNLINKED', createdAt: new Date().toISOString() };
    db.tenants.push(t);
    audit(user.email, 'Tạo hồ sơ người thuê', t.fullName, 'WORKSPACE');
    return t;
  },
  async updateTenant(ws, id, input) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const t = findTenant(ws, id);
    Object.assign(t, input);
    db.contracts.filter((c) => c.primaryTenantId === id).forEach((c) => (c.primaryTenantName = t.fullName));
    return t;
  },
  async reviewLinkRequest(ws, tenantId, approve) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const t = findTenant(ws, tenantId);
    if (t.accountLinkStatus !== 'PENDING') conflict('Không có yêu cầu liên kết đang chờ.');
    t.accountLinkStatus = approve ? 'LINKED' : 'UNLINKED';
    const userId = db.pendingLinks[t.id];
    delete db.pendingLinks[t.id];
    if (userId) {
      const contract = db.contracts.find((c) => c.primaryTenantId === t.id);
      (db.linkRequests[userId] ?? [])
        .filter((r) => r.status === 'PENDING' && r.contractCode === contract?.code)
        .forEach((r) => (r.status = approve ? 'APPROVED' : 'REJECTED'));
      if (approve) {
        db.tenantLinks[userId] = t.id;
        const account = mockUsers.find((u) => u.user.id === userId);
        if (account) account.user = { ...account.user, tenantLinked: true };
      }
    }
    audit(user.email, approve ? 'Duyệt liên kết hồ sơ thuê' : 'Từ chối liên kết hồ sơ thuê', t.fullName, 'USER');
    return t;
  },

  async listContracts(ws, f) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.contracts
      .filter(
        (c) =>
          c.workspaceId === ws &&
          (!f.status || c.status === f.status) &&
          (!f.roomId || c.roomId === f.roomId) &&
          (!f.tenantId || c.occupantIds.includes(f.tenantId)) &&
          includesText(`${c.code} ${c.roomCode} ${c.primaryTenantName}`, f.q),
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  },
  async getContract(ws, id) {
    await simulate();
    requireMember(ws);
    return findContract(ws, id);
  },
  async createContract(ws, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const { room, tenant } = validateContract(ws, input);
    const now = new Date().toISOString();
    const c: Contract = {
      ...input,
      occupantIds: [...new Set([input.primaryTenantId, ...input.occupantIds])],
      id: nextId('ctr'),
      workspaceId: ws,
      code: `HĐ-${1100 + db.contracts.length}`,
      roomCode: room.code,
      buildingName: room.buildingName,
      primaryTenantName: tenant.fullName,
      status: 'DRAFT',
      history: [{ at: now, action: 'Tạo hợp đồng (nháp)', by: user.fullName }],
      createdAt: now,
    };
    db.contracts.push(c);
    audit(user.email, 'Tạo hợp đồng nháp', c.code, 'WORKSPACE');
    return c;
  },
  async updateContract(ws, id, input) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const c = findContract(ws, id);
    if (c.status !== 'DRAFT') conflict('Chỉ được sửa hợp đồng ở trạng thái Nháp.');
    const { room, tenant } = validateContract(ws, input);
    Object.assign(c, input, {
      occupantIds: [...new Set([input.primaryTenantId, ...input.occupantIds])],
      roomCode: room.code,
      buildingName: room.buildingName,
      primaryTenantName: tenant.fullName,
    });
    c.history.push({ at: new Date().toISOString(), action: 'Cập nhật hợp đồng nháp', by: user.fullName });
    return c;
  },
  async activateContract(ws, id) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const c = findContract(ws, id);
    if (c.status !== 'DRAFT') conflict('Chỉ kích hoạt được hợp đồng Nháp.');
    const overlaps = findOverlappingContracts(db.contracts, c);
    if (overlaps.length) {
      const o = overlaps[0]!;
      conflict(`Phòng đã có hợp đồng ACTIVE ${o.code} (${formatDate(o.startDate)} – ${formatDate(o.endDate)}) trùng thời gian.`);
    }
    c.status = 'ACTIVE';
    c.history.push({ at: new Date().toISOString(), action: 'Kích hoạt hợp đồng', by: user.fullName });
    const room = db.rooms.find((r) => r.id === c.roomId);
    if (room) {
      room.operationalStatus = 'OCCUPIED';
      if (room.listingStatus === 'PUBLISHED') room.listingStatus = 'HIDDEN';
    }
    if (c.deposit > 0) {
      db.deposits.push({
        id: nextId('dep'),
        workspaceId: ws,
        contractId: c.id,
        contractCode: c.code,
        roomCode: c.roomCode,
        tenantName: c.primaryTenantName,
        type: 'COLLECT',
        amount: c.deposit,
        date: c.startDate,
        note: 'Ghi nhận khi kích hoạt hợp đồng',
      });
    }
    audit(user.email, 'Kích hoạt hợp đồng', c.code, 'WORKSPACE');
    return c;
  },
  async terminateContract(ws, id, endDate, reason) {
    await simulate();
    const { user } = requireMember(ws, 'rooms.write');
    const c = findContract(ws, id);
    if (c.status !== 'ACTIVE') conflict('Chỉ chấm dứt được hợp đồng đang hiệu lực.');
    if (endDate < c.startDate) validation('Ngày chấm dứt không hợp lệ.', { endDate: 'Phải sau ngày bắt đầu hợp đồng' });
    c.status = 'TERMINATED';
    c.endDate = endDate;
    c.history.push({ at: new Date().toISOString(), action: `Chấm dứt hợp đồng: ${reason}`, by: user.fullName });
    const room = db.rooms.find((r) => r.id === c.roomId);
    if (room) room.operationalStatus = 'VACANT';
    audit(user.email, 'Chấm dứt hợp đồng', c.code, 'WORKSPACE');
    return c;
  },

  async listVehicles(ws, q) {
    const { empty } = await simulate();
    requireMember(ws);
    if (empty) return [];
    return db.vehicles.filter((v) => v.workspaceId === ws && includesText(`${v.plate} ${v.tenantName} ${v.roomCode} ${v.brand}`, q));
  },
  async saveVehicle(ws, input, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const tenant = findTenant(ws, input.tenantId);
    const plate = input.plate.trim().toUpperCase();
    if (db.vehicles.some((v) => v.workspaceId === ws && v.id !== id && v.plate.toUpperCase() === plate)) {
      conflict('Biển số đã được đăng ký trong workspace.');
    }
    const contract = db.contracts.find((c) => c.status === 'ACTIVE' && c.occupantIds.includes(tenant.id));
    const data = { ...input, plate, tenantName: tenant.fullName, roomCode: contract?.roomCode ?? '—' };
    if (id) {
      const v = db.vehicles.find((x) => x.workspaceId === ws && x.id === id) ?? notFound('Không tìm thấy phương tiện.');
      Object.assign(v, data);
      return v;
    }
    const v = { ...data, id: nextId('veh'), workspaceId: ws };
    db.vehicles.push(v);
    return v;
  },
  async deleteVehicle(ws, id) {
    await simulate();
    requireMember(ws, 'rooms.write');
    const idx = db.vehicles.findIndex((v) => v.workspaceId === ws && v.id === id);
    if (idx < 0) notFound('Không tìm thấy phương tiện.');
    db.vehicles.splice(idx, 1);
  },
};
