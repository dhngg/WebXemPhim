import {
  contractPhase,
  MAINTENANCE_PRIORITIES,
  type ContractResponse,
  type InvoiceItemResponse,
  type MaintenanceRequestResponse,
  type TenantLinkRequestResponse,
  type TenantSelfResponse,
} from '@rental/shared';
import type { PageQuery, TenantPortalApi } from '@/features/tenant-portal/api';
import type { Contract } from '@/features/leasing/types';
import { ApiError } from '@/services/http/ApiError';
import { addDays, addMonths, currentPeriod, periodEnd, todayVN } from '@/lib/dates';
import { db, nextId } from '../db';
import { acceptInvitation, activeTenantIds, tenantRecord } from '../tenant-links';
import { simulate } from '../mockUtils';
import { requireSession } from './auth.mock';
import { depositLedger, depositPage } from './deposits.mock';
import { adjustmentPage, adjustmentStore, invoiceStore, paymentLedger, refreshTotals, strip, type StoredInvoice } from './invoices.mock';
import { maintenanceStore } from './maintenance-requests.mock';
import { paymentPage } from './payments.mock';
import { endedAtOf } from './tenancy.mock';

/**
 * Mock Cổng người thuê theo ĐÚNG hình dạng, phạm vi và quy tắc của 14 endpoint backend `/…/me`:
 * mọi kết quả chỉ gồm hồ sơ người thuê còn liên kết của chính tài khoản đang đăng nhập (liên kết bị gỡ → biến mất),
 * người thuê chỉ thấy hóa đơn ISSUED, hợp đồng tương lai vẫn xem được, danh sách luôn phân trang, thông tin nội bộ
 * (người phụ trách, người đổi trạng thái) bị ẩn. Không có thanh toán/minh chứng/OTP/ảnh/bình luận.
 * Chỉ dùng khi VITE_USE_MOCK_API=true.
 */
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const me = () => requireSession().user;
const now = () => new Date().toISOString();
const at = (date: string, hour = 9) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;

function checkPage(q: PageQuery) {
  if (!Number.isInteger(q.page) || q.page < 1 || !Number.isInteger(q.limit) || q.limit < 1 || q.limit > 50) {
    fail(400, 'VALIDATION_ERROR', 'page must be >= 1 and limit between 1 and 50');
  }
}
const pageOf = <T>(all: T[], q: PageQuery) => ({ items: all.slice((q.page - 1) * q.limit, q.page * q.limit), page: q.page, limit: q.limit, total: all.length });

// ------------------------------------------------------------------------------------------------ hợp đồng
interface RawContract {
  id: string;
  workspaceId: string;
  roomId: string;
  roomCode: string;
  buildingId: string;
  tenantId: string;
  tenantName: string;
  startDate: string;
  endDate: string;
  monthlyRent: string;
  status: 'ACTIVE' | 'ENDED';
  endedAt: string | null;
  notes: string | null;
  createdAt: string;
}
/** Hợp đồng chỉ có trong dữ liệu mẫu của Cổng người thuê, để phủ đủ pha (tương lai, quá hạn, đã kết thúc, đã hủy). */
const extraContracts: RawContract[] = [];

function rawOf(c: Contract): RawContract {
  const ended = c.status !== 'ACTIVE';
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    roomId: c.roomId,
    roomCode: c.roomCode,
    buildingId: db.rooms.find((r) => r.id === c.roomId)?.buildingId ?? '',
    tenantId: c.primaryTenantId,
    tenantName: c.primaryTenantName,
    startDate: c.startDate,
    endDate: c.endDate,
    monthlyRent: String(c.monthlyRent),
    status: ended ? 'ENDED' : 'ACTIVE',
    endedAt: ended ? (endedAtOf(c.id) ?? at(c.endDate, 12)) : null,
    notes: c.note ?? null,
    createdAt: c.createdAt,
  };
}
function toContract(r: RawContract): ContractResponse {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    roomId: r.roomId,
    tenantId: r.tenantId,
    startDate: r.startDate,
    endDate: r.endDate,
    monthlyRent: r.monthlyRent,
    status: r.status,
    phase: contractPhase({ status: r.status, startDate: r.startDate, endDate: r.endDate, endedAt: r.endedAt }, todayVN()),
    notes: r.notes,
    endedAt: r.endedAt,
    createdAt: r.createdAt,
    updatedAt: r.createdAt,
    room: { id: r.roomId, code: r.roomCode, buildingId: r.buildingId },
    tenant: { id: r.tenantId, fullName: r.tenantName },
  };
}
function rawContractsOf(tenantIds: string[]): RawContract[] {
  seed();
  const own = new Set(tenantIds);
  return [...db.contracts.filter((c) => c.status !== 'DRAFT' && own.has(c.primaryTenantId)).map(rawOf), ...extraContracts.filter((c) => own.has(c.tenantId))].sort(
    (a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id),
  );
}
const scopeTenants = () => activeTenantIds(me().id);
const myContracts = () => rawContractsOf(scopeTenants());
const findContract = (id: string) => myContracts().find((c) => c.id === id) ?? fail(404, 'CONTRACT_NOT_FOUND', 'Contract not found');

// ------------------------------------------------------------------------------------------------ dữ liệu mẫu
let seeded = false;
let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

function seed() {
  if (seeded) return;
  seeded = true;
  const today = todayVN();
  const ws = db.tenants[0]!.workspaceId;
  const spare = db.rooms.find((r) => r.workspaceId === ws && r.operationalStatus === 'VACANT') ?? db.rooms[0]!;
  const extra = (id: string, tenantId: string, patch: Partial<RawContract>): RawContract => {
    const t = tenantRecord(tenantId)!;
    return {
      id, workspaceId: t.workspaceId, roomId: spare.id, roomCode: spare.code, buildingId: spare.buildingId, tenantId, tenantName: t.fullName,
      startDate: today, endDate: today, monthlyRent: '3200000', status: 'ACTIVE', endedAt: null, notes: null, createdAt: at(addDays(today, -900)), ...patch,
    };
  };
  extraContracts.push(
    extra('ctr-t1-ended', 'ten-1', { startDate: addDays(today, -800), endDate: addDays(today, -435), status: 'ENDED', endedAt: at(addDays(today, -430)), notes: 'Hợp đồng thuê trước đây, đã kết thúc đúng hạn.' }),
    extra('ctr-t1-upcoming', 'ten-1', { startDate: addDays(today, 25), endDate: addDays(today, 390), monthlyRent: '3500000', notes: 'Hợp đồng gia hạn bắt đầu sau.' }),
    extra('ctr-t1-cancelled', 'ten-1', { startDate: addDays(today, 60), endDate: addDays(today, 425), status: 'ENDED', endedAt: at(addDays(today, -2)), notes: 'Đã hủy trước ngày bắt đầu.' }),
    extra('ctr-t2-overdue', 'ten-2', { startDate: addDays(today, -420), endDate: addDays(today, -15), monthlyRent: '2800000' }),
    {
      id: 'ctr-sh-1', workspaceId: 'ws-sunhouse', roomId: 'room-sh-101', roomCode: 'S.101', buildingId: 'bld-sh', tenantId: 'ten-sh-1', tenantName: 'Phạm Minh Châu',
      startDate: addDays(today, -90), endDate: addDays(today, 275), monthlyRent: '4100000', status: 'ACTIVE', endedAt: null, notes: null, createdAt: at(addDays(today, -95)),
    },
  );

  seedBilling();
  seedDeposits();
  seedMaintenance();
  seedLinkRequests();
}

let itemNo = 0;
function item(order: number, itemType: InvoiceItemResponse['itemType'], code: string, description: string, unit: string, quantity: string, unitPrice: string, amount: number): InvoiceItemResponse {
  return {
    id: `tii-${++itemNo}`, sortOrder: order, itemType, code, description, unit, quantity, unitPrice, prorationNumerator: null, prorationDenominator: null,
    amount: String(Math.round(amount)), ratePlanId: null, meterReadingId: null, meterRevision: null, details: {},
  };
}
function makeInvoice(c: RawContract, period: string, status: 'DRAFT' | 'ISSUED', k: number): StoredInvoice {
  const rent = Number(c.monthlyRent);
  const kwh = 80 + k * 7;
  const items = [
    item(1, 'RENT', 'RENT', 'Tiền thuê phòng', 'tháng', '1.000', `${rent}.0000`, rent),
    item(2, 'ELECTRICITY', 'ELECTRICITY', 'Tiền điện', 'kWh', `${kwh}.000`, '3500.0000', kwh * 3500),
    item(3, 'WATER', 'WATER', 'Tiền nước', 'm³', '4.000', '18000.0000', 4 * 18000),
    item(4, 'SERVICE', 'INTERNET', 'Internet', 'phòng', '1.000', '100000.0000', 100000),
  ];
  const t = at(periodEnd(period), 8);
  const inv: StoredInvoice = {
    id: `tinv-${c.id}-${period}`, workspaceId: c.workspaceId, buildingId: c.buildingId, roomId: c.roomId, contractId: c.id, period, status, tenantId: c.tenantId,
    occupantCount: 1, occupantCountConfirmedBy: 'mock-owner', occupantCountConfirmedAt: t, billsVehicles: true,
    dueDate: addDays(periodEnd(period), 10), notes: null, missingItems: [], isComplete: true,
    totalAmount: null, provisionalAmount: null, roundingRule: 'ROUND_HALF_UP_1_VND', adjustmentsTotal: null, adjustedTotal: null, paidTotal: null, outstanding: null, paymentStatus: null,
    items, issuedAt: status === 'ISSUED' ? t : null, createdAt: t, updatedAt: t, _confirmedAt: null,
  };
  invoiceStore.push(inv);
  return inv;
}
let ledgerClock = Date.UTC(2026, 0, 1);
function pay(inv: StoredInvoice, kind: 'PAYMENT' | 'REVERSAL', amount: number, note: string | null, reverses?: string) {
  const id = uid('tpay');
  const created = new Date((ledgerClock += 60_000)).toISOString();
  paymentLedger.push({
    id, workspaceId: inv.workspaceId, invoiceId: inv.id, kind, amount: String(amount), method: 'BANK_TRANSFER', receivedAt: created, note,
    reversesPaymentId: reverses ?? null, reversedByPaymentId: null, confirmedBy: 'u-owner', createdAt: created, key: `seed-${id}`,
  });
  return id;
}
function adjust(inv: StoredInvoice, amount: number, reason: string, ref?: string) {
  const id = uid('tadj');
  adjustmentStore.push({
    id, workspaceId: inv.workspaceId, invoiceId: inv.id, amount: String(amount), requestedAmount: `${amount}.0000`, reason, referenceAdjustmentId: ref ?? null,
    createdBy: 'u-owner', createdAt: new Date((ledgerClock += 60_000)).toISOString(), key: `seed-${id}`, buildingId: inv.buildingId,
  });
  return id;
}

function seedBilling() {
  const cur = currentPeriod();
  const c1 = rawContractsOf(['ten-1']).find((c) => c.id === 'ctr-1');
  const c2 = rawContractsOf(['ten-2']).find((c) => c.id === 'ctr-2');
  const c3 = rawContractsOf(['ten-4'])[0];
  if (c1) {
    // kỳ -3: đã trả đủ, có một khoản bị đảo rồi thu lại → sổ có cả PAYMENT và REVERSAL
    const a = makeInvoice(c1, addMonths(cur, -3), 'ISSUED', 1);
    const total = a.items.reduce((s, i) => s + Number(i.amount), 0);
    const first = pay(a, 'PAYMENT', total, 'Chuyển khoản lần 1');
    pay(a, 'REVERSAL', total, 'Ghi nhầm số tiền', first);
    pay(a, 'PAYMENT', total, 'Thu lại sau khi đối soát');
    refreshTotals(a);
    // kỳ -2: có điều chỉnh (kèm một bút toán sửa lại) và mới trả một phần
    const b = makeInvoice(c1, addMonths(cur, -2), 'ISSUED', 2);
    const adj = adjust(b, 100000, 'Phí thay bóng đèn phát sinh');
    adjust(b, -30000, 'Điều chỉnh lại theo biên bản', adj);
    pay(b, 'PAYMENT', 2000000, 'Trả một phần');
    refreshTotals(b);
    // kỳ -1: chưa thanh toán; kỳ hiện tại: bản nháp (người thuê không được thấy)
    refreshTotals(makeInvoice(c1, addMonths(cur, -1), 'ISSUED', 3));
    refreshTotals(makeInvoice(c1, cur, 'DRAFT', 4));
  }
  if (c2) {
    const a = makeInvoice(c2, addMonths(cur, -2), 'ISSUED', 5);
    pay(a, 'PAYMENT', a.items.reduce((s, i) => s + Number(i.amount), 0), null);
    refreshTotals(a);
    refreshTotals(makeInvoice(c2, addMonths(cur, -1), 'ISSUED', 6));
  }
  // hóa đơn của người thuê KHÁC: tài khoản đang đăng nhập không được thấy (phải 404)
  if (c3) refreshTotals(makeInvoice(c3, addMonths(cur, -1), 'ISSUED', 7));
}

let depositNo = 0;
function deposit(contractId: string, workspaceId: string, kind: 'COLLECTION' | 'DEDUCTION' | 'REFUND' | 'REVERSAL', amount: number, occurredAt: string, extra: { reason?: string; reference?: string; note?: string; reverses?: string } = {}) {
  const id = `tdep-${++depositNo}`;
  const created = new Date((ledgerClock += 60_000)).toISOString();
  depositLedger.push({
    id, workspaceId, contractId, kind, amount: String(amount), method: kind === 'DEDUCTION' || kind === 'REVERSAL' ? null : 'BANK_TRANSFER', occurredAt,
    reason: extra.reason ?? null, reference: extra.reference ?? null, note: extra.note ?? null, reversesEntryId: extra.reverses ?? null, reversedByEntryId: null,
    createdBy: 'u-owner', createdAt: created, key: `seed-${id}`,
  });
  return id;
}
function seedDeposits() {
  const today = todayVN();
  const ws = db.tenants[0]!.workspaceId;
  const c1 = db.contracts.find((c) => c.id === 'ctr-1');
  if (c1) {
    const wrong = deposit('ctr-1', ws, 'COLLECTION', Number(c1.monthlyRent) * 2, at(c1.startDate, 10), { note: 'Ghi nhầm số tiền' });
    deposit('ctr-1', ws, 'REVERSAL', Number(c1.monthlyRent) * 2, at(c1.startDate, 11), { reason: 'Ghi nhầm số tiền', reverses: wrong });
    deposit('ctr-1', ws, 'COLLECTION', Number(c1.monthlyRent), at(c1.startDate, 12), { reference: 'FT-0001' });
  }
  deposit('ctr-t1-ended', ws, 'COLLECTION', 3200000, at(addDays(today, -800), 10));
  deposit('ctr-t1-ended', ws, 'DEDUCTION', 300000, at(addDays(today, -430), 10), { reason: 'Sửa khóa cửa', reference: 'BB-014' });
  deposit('ctr-t1-ended', ws, 'REFUND', 2900000, at(addDays(today, -429), 10), { reason: 'Hoàn cọc khi trả phòng', reference: 'FT-9981' });
  deposit('ctr-t1-upcoming', ws, 'COLLECTION', 3500000, at(addDays(today, -3), 10));
  deposit('ctr-sh-1', 'ws-sunhouse', 'COLLECTION', 4100000, at(addDays(today, -90), 10));
  // đánh dấu bản gốc đã bị đảo (backend trả reversedByEntryId trên bản gốc)
  for (const e of depositLedger) e.reversedByEntryId = depositLedger.find((x) => x.reversesEntryId === e.id)?.id ?? null;
}

function history(r: Pick<MaintenanceRequestResponse, 'priority'>, steps: Array<[MaintenanceRequestResponse['status'] | null, MaintenanceRequestResponse['status'], string, string | null]>) {
  return steps.map(([from, to, createdAt, note], i) => ({
    id: `tmh-${counter++}-${i}`, fromStatus: from, toStatus: to, priority: r.priority, assigneeUserId: to === 'IN_PROGRESS' ? 'u-owner' : null, note, changedBy: to === 'OPEN' || to === 'CANCELLED' ? 'u-tenant' : 'u-owner', createdAt,
  }));
}
function seedMaintenance() {
  const c1 = rawContractsOf(['ten-1']).find((c) => c.id === 'ctr-1');
  if (!c1) return;
  const base = (id: string, patch: Partial<MaintenanceRequestResponse>): MaintenanceRequestResponse => ({
    id, workspaceId: c1.workspaceId, buildingId: c1.buildingId, roomId: c1.roomId, contractId: c1.id, tenantId: c1.tenantId, requestedBy: 'u-tenant',
    title: '', description: '', priority: 'MEDIUM', status: 'OPEN', assigneeUserId: null, resolutionNote: null, resolvedAt: null, closedAt: null,
    createdAt: now(), updatedAt: now(), ...patch,
  });
  const d = (n: number) => at(addDays(todayVN(), -n));
  const open = base('tmnt-open', { title: 'Đèn hành lang chập chờn', description: 'Đèn trước cửa phòng nhấp nháy từ tối qua.', priority: 'LOW', createdAt: d(1), updatedAt: d(1) });
  open.history = history(open, [[null, 'OPEN', d(1), null]]);
  const doing = base('tmnt-doing', { title: 'Vòi nước bồn rửa rỉ nước', description: 'Nước rỉ ở chân vòi, sàn bị ướt.', priority: 'HIGH', status: 'IN_PROGRESS', assigneeUserId: 'u-owner', createdAt: d(4), updatedAt: d(2) });
  doing.history = history(doing, [[null, 'OPEN', d(4), null], ['OPEN', 'IN_PROGRESS', d(2), 'Đã hẹn thợ sửa']]);
  const done = base('tmnt-done', { title: 'Điều hòa không lạnh', description: 'Máy chạy nhưng không ra hơi lạnh.', priority: 'MEDIUM', status: 'RESOLVED', resolutionNote: 'Đã nạp gas và vệ sinh dàn lạnh.', resolvedAt: d(8), createdAt: d(14), updatedAt: d(8) });
  done.history = history(done, [[null, 'OPEN', d(14), null], ['OPEN', 'IN_PROGRESS', d(12), null], ['IN_PROGRESS', 'RESOLVED', d(8), 'Đã nạp gas và vệ sinh dàn lạnh.']]);
  const cancelled = base('tmnt-cancelled', { title: 'Ổ cắm lỏng', description: 'Ổ cắm cạnh giường bị lỏng.', status: 'CANCELLED', createdAt: d(20), updatedAt: d(19) });
  cancelled.history = history(cancelled, [[null, 'OPEN', d(20), null], ['OPEN', 'CANCELLED', d(19), 'Tự khắc phục được']]);
  maintenanceStore.push(open, doing, done, cancelled);
}

const linkRequestStore: TenantLinkRequestResponse[] = [];
function seedLinkRequests() {
  const requester = { id: 'u-tenant', email: 'nam@demo.vn', displayName: 'Trần Văn Nam' };
  const make = (tenantId: string, status: TenantLinkRequestResponse['status'], daysAgo: number, message: string | null, decisionNote: string | null): TenantLinkRequestResponse => {
    const t = tenantRecord(tenantId)!;
    const created = at(addDays(todayVN(), -daysAgo));
    return {
      id: `tlr-${tenantId}`, workspaceId: t.workspaceId, tenantId, requesterUserId: requester.id, status, message, decisionNote,
      decidedAt: status === 'PENDING' ? null : at(addDays(todayVN(), -daysAgo + 1)), createdAt: created, updatedAt: created, tenant: { id: tenantId, fullName: t.fullName }, requester,
    };
  };
  linkRequestStore.push(
    make('ten-1', 'APPROVED', 120, 'Em là người thuê phòng P.302.', 'Đã xác nhận.'),
    make('ten-3', 'REJECTED', 60, null, 'Không khớp hồ sơ thuê.'),
    make('ten-5', 'PENDING', 1, 'Nhờ chủ trọ duyệt giúp em.', null),
  );
}

// ------------------------------------------------------------------------------------------------ bảo trì
const tenantView = (r: MaintenanceRequestResponse, withHistory: boolean): MaintenanceRequestResponse => {
  const { history: h, ...rest } = r;
  const view: MaintenanceRequestResponse = { ...rest, requestedBy: null, assigneeUserId: null };
  if (withHistory) view.history = (h ?? []).map((x) => ({ ...x, assigneeUserId: null, changedBy: null }));
  return view;
};
function myRequests() {
  seed();
  const own = new Set(scopeTenants());
  return maintenanceStore.filter((r) => r.tenantId !== null && own.has(r.tenantId));
}
const findRequest = (id: string) => myRequests().find((r) => r.id === id) ?? fail(404, 'MAINTENANCE_NOT_FOUND', 'Maintenance request not found');
const blank = (v: unknown) => typeof v !== 'string' || !v.trim();

// ------------------------------------------------------------------------------------------------ API
export const tenantPortalMock: TenantPortalApi = {
  async acceptInvitation(input) {
    await simulate();
    seed();
    return acceptInvitation(me().id, input.token);
  },

  async linkRequests(q) {
    const { empty } = await simulate();
    seed();
    checkPage(q);
    if (empty) return pageOf([], q);
    return pageOf(
      linkRequestStore.filter((r) => r.requesterUserId === me().id && (!q.status || r.status === q.status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      q,
    );
  },

  async linkedTenants() {
    const { empty } = await simulate();
    if (empty) return [];
    return scopeTenants().flatMap((id): TenantSelfResponse[] => {
      const t = tenantRecord(id);
      return t ? [{ ...t }] : [];
    });
  },

  async contracts(q) {
    const { empty } = await simulate();
    checkPage(q);
    if (empty) return pageOf([], q);
    return pageOf(myContracts().filter((c) => !q.status || c.status === q.status).map(toContract), q);
  },
  async contract(id) {
    await simulate();
    return toContract(findContract(id));
  },
  async deposit(id, q) {
    await simulate();
    checkPage(q);
    findContract(id);
    return depositPage(id, q);
  },

  async invoices(q) {
    const { empty } = await simulate();
    seed();
    checkPage(q);
    if (empty) return pageOf([], q);
    const own = new Set(scopeTenants());
    const all = invoiceStore
      .filter((i) => i.status === 'ISSUED' && own.has(i.tenantId) && (!q.period || i.period === q.period))
      .sort((a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt));
    return pageOf(all.map(strip), q);
  },
  async invoice(id) {
    await simulate();
    return strip(findInvoice(id));
  },
  async adjustments(id, q) {
    await simulate();
    checkPage(q);
    return adjustmentPage(findInvoice(id), q);
  },
  async payments(id, q) {
    await simulate();
    checkPage(q);
    return paymentPage(findInvoice(id), q);
  },

  async createMaintenance(input) {
    await simulate();
    seed();
    if (blank(input.title) || input.title.trim().length > 150 || blank(input.description) || input.description.trim().length > 5000) {
      fail(400, 'VALIDATION_ERROR', 'title (max 150) and description (max 5000) are required');
    }
    if (input.priority !== undefined && !MAINTENANCE_PRIORITIES.includes(input.priority)) fail(400, 'VALIDATION_ERROR', 'priority is invalid');
    const contract = myContracts().find((c) => c.id === input.contractId && c.status === 'ACTIVE') ?? fail(404, 'CONTRACT_NOT_FOUND', 'Contract not found');
    if (contract.startDate > todayVN()) fail(409, 'MAINTENANCE_NOT_ELIGIBLE', 'The contract has not started yet');
    const t = now();
    const priority = input.priority ?? 'MEDIUM';
    const req: MaintenanceRequestResponse = {
      id: nextId('mnt'), workspaceId: contract.workspaceId, buildingId: contract.buildingId, roomId: contract.roomId, contractId: contract.id, tenantId: contract.tenantId, requestedBy: me().id,
      title: input.title.trim(), description: input.description.trim(), priority, status: 'OPEN', assigneeUserId: null, resolutionNote: null, resolvedAt: null, closedAt: null, createdAt: t, updatedAt: t,
      history: [{ id: nextId('mh'), fromStatus: null, toStatus: 'OPEN', priority, assigneeUserId: null, note: null, changedBy: me().id, createdAt: t }],
    };
    maintenanceStore.push(req);
    return tenantView(req, true);
  },
  async maintenance(q) {
    const { empty } = await simulate();
    checkPage(q);
    if (empty) return pageOf([], q);
    const all = myRequests().filter((r) => !q.status || r.status === q.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return pageOf(all.map((r) => tenantView(r, false)), q);
  },
  async maintenanceRequest(id) {
    await simulate();
    return tenantView(findRequest(id), true);
  },
  async cancelMaintenance(id, input) {
    await simulate();
    const r = findRequest(id);
    const reason = input.reason?.trim();
    if (reason && reason.length > 500) fail(400, 'VALIDATION_ERROR', 'reason must be at most 500 characters');
    if (r.status !== 'OPEN' || r.assigneeUserId !== null) fail(409, 'MAINTENANCE_NOT_CANCELLABLE', 'Only unassigned OPEN requests can be cancelled');
    const t = now();
    r.status = 'CANCELLED';
    r.updatedAt = t;
    r.history = [...(r.history ?? []), { id: nextId('mh'), fromStatus: 'OPEN', toStatus: 'CANCELLED', priority: r.priority, assigneeUserId: null, note: reason || null, changedBy: me().id, createdAt: t }];
    return tenantView(r, true);
  },
};

function findInvoice(id: string): StoredInvoice {
  seed();
  const own = new Set(scopeTenants());
  return invoiceStore.find((i) => i.id === id && i.status === 'ISSUED' && own.has(i.tenantId)) ?? fail(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
}
