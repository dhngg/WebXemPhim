import type {
  CreateInvoiceAdjustmentRequest,
  InvoicePaymentResponse,
  InvoiceAdjustmentPageResponse,
  InvoiceAdjustmentResponse,
  InvoiceItemResponse,
  InvoiceMissingItem,
  InvoiceResponse,
  UpdateInvoiceRequest,
} from '@rental/shared';
import type { InvoicesApi } from '@/features/invoices/api';
import { utilitiesMock } from './utilities.mock';
import { tenancyMock } from './tenancy.mock';
import { ApiError } from '@/services/http/ApiError';
import { daysInPeriod, periodEnd, periodStart } from '@/lib/dates';
import { db, nextId } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';

/**
 * Mock theo đúng hình dạng và quy tắc của backend (Invoices + Adjustments): chỉ OWNER, mọi URL có tòa nhà,
 * chỉ có trạng thái DRAFT/ISSUED (tình trạng thu tiền là paymentStatus riêng), phát hành chỉ khi đủ dữ liệu,
 * ISSUED không sửa/xóa mà điều chỉnh bằng bút toán có khóa chống gửi trùng.
 * Cách tính ở đây chỉ để chế độ demo có dữ liệu; chế độ API thật hiển thị đúng số backend trả.
 */
export interface StoredInvoice extends InvoiceResponse {
  _confirmedAt: string | null;
}
export const invoiceStore: StoredInvoice[] = [];
const invoices = invoiceStore;
/** Sổ thanh toán của hóa đơn (chỉ PAYMENT/REVERSAL, không có trạng thái chờ xác nhận); dùng chung với mock Payments. */
export const paymentLedger: Array<InvoicePaymentResponse & { key: string }> = [];
export const paidOf = (invoiceId: string) =>
  paymentLedger.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + (p.kind === 'PAYMENT' ? Number(p.amount) : -Number(p.amount)), 0);
export const adjustmentStore: Array<InvoiceAdjustmentResponse & { key: string; buildingId: string }> = [];
const adjustments = adjustmentStore;

const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};
const now = () => new Date().toISOString();
const whole = (n: number) => Math.round(n).toString();

function scope(ws: string, buildingId: string) {
  const { user } = requireMember(ws, 'rooms.write');
  if (!db.buildings.some((b) => b.workspaceId === ws && b.id === buildingId)) fail(404, 'BUILDING_NOT_FOUND', 'Building not found');
  return user;
}

export const strip = (i: StoredInvoice): InvoiceResponse => {
  const { _confirmedAt, ...rest } = i;
  void _confirmedAt;
  return { ...rest, items: i.items.map((x) => ({ ...x })), missingItems: i.missingItems.map((m) => ({ ...m })) };
};
export const findStoredInvoice = (ws: string, buildingId: string, id: string) =>
  invoices.find((i) => i.workspaceId === ws && i.buildingId === buildingId && i.id === id) ?? fail(404, 'INVOICE_NOT_FOUND', 'Invoice not found');

const adjustmentsOf = (invoiceId: string) => adjustments.filter((a) => a.invoiceId === invoiceId);
const adjustmentSum = (invoiceId: string) => adjustmentsOf(invoiceId).reduce((s, a) => s + Number(a.amount), 0);

/** Giá trị phụ thuộc trạng thái: DRAFT chỉ có tạm tính; ISSUED có tổng chốt, điều chỉnh và phần thu (chưa có khoản thu nào). */
export function refreshTotals(i: StoredInvoice) {
  const sum = i.items.reduce((s, x) => s + Number(x.amount), 0);
  if (i.status === 'DRAFT') {
    i.provisionalAmount = whole(sum);
    i.totalAmount = i.adjustmentsTotal = i.adjustedTotal = i.paidTotal = i.outstanding = i.paymentStatus = null;
    return;
  }
  const adj = adjustmentSum(i.id);
  i.provisionalAmount = null;
  i.totalAmount = whole(sum);
  i.adjustmentsTotal = whole(adj);
  i.adjustedTotal = whole(sum + adj);
  const paid = paidOf(i.id);
  i.paidTotal = whole(paid);
  i.outstanding = whole(Math.max(0, sum + adj - paid));
  i.paymentStatus = paid >= sum + adj ? 'PAID' : paid === 0 ? 'UNPAID' : 'PARTIALLY_PAID';
}

async function compute(ws: string, buildingId: string, contract: Awaited<ReturnType<typeof tenancyMock.getContract>>, period: string, occupantCount: number | null) {
  const missing: InvoiceMissingItem[] = [];
  const items: InvoiceItemResponse[] = [];
  const from = periodStart(period);
  const to = periodEnd(period);
  const start = contract.startDate > from ? contract.startDate : from;
  const end = contract.endDate < to ? contract.endDate : to;
  const days = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1);
  const dim = daysInPeriod(period);
  const rent = Number(contract.monthlyRent);
  let order = 1;
  const add = (type: InvoiceItemResponse['itemType'], code: string, description: string, unit: string, qty: string, price: string, amount: number, extra: Partial<InvoiceItemResponse> = {}) =>
    items.push({
      id: nextId('ini'), sortOrder: order++, itemType: type, code, description, unit, quantity: qty, unitPrice: price,
      prorationNumerator: null, prorationDenominator: null, amount: whole(amount), ratePlanId: null, meterReadingId: null, meterRevision: null, details: {}, ...extra,
    });
  add('RENT', 'RENT', 'Tiền thuê phòng', 'tháng', '1.000', `${rent.toFixed(4)}`, (rent * days) / dim, {
    prorationNumerator: days < dim ? days : null,
    prorationDenominator: days < dim ? dim : null,
    details: { monthlyRent: contract.monthlyRent, days, daysInPeriod: dim },
  });

  const rates = (await utilitiesMock.listRates(ws, buildingId, { status: undefined })).filter((r) => r.effectiveFrom <= to && (!r.effectiveTo || r.effectiveTo > from));
  const latest = new Map<string, (typeof rates)[number]>();
  for (const r of rates) if (!latest.has(r.code) || r.effectiveFrom > latest.get(r.code)!.effectiveFrom) latest.set(r.code, r);
  const readings = await utilitiesMock.listMeterReadings(ws, buildingId, contract.roomId, { period });
  const assigned = new Set((await utilitiesMock.listRoomServices(ws, buildingId, contract.roomId)).filter((s) => s.effectiveFrom <= to && (!s.effectiveTo || s.effectiveTo > from)).map((s) => s.rateCode));
  for (const r of latest.values()) {
    if (r.billingUnit === 'KWH' || r.billingUnit === 'CUBIC_METER') {
      const type = r.billingUnit === 'KWH' ? 'ELECTRICITY' : 'WATER';
      const reading = readings.find((m) => m.meterType === type);
      if (!reading) {
        missing.push({ code: r.code, reason: 'METER_READING_MISSING', detail: `Chưa có chỉ số ${type === 'ELECTRICITY' ? 'điện' : 'nước'} kỳ ${period}` });
        continue;
      }
      add(type, r.code, r.name, r.billingUnit === 'KWH' ? 'kWh' : 'm³', Number(reading.consumption).toFixed(3), r.unitPrice, Number(reading.consumption) * Number(r.unitPrice), {
        meterReadingId: reading.id,
        meterRevision: reading.revision,
        details: { previousReading: reading.previousReading, currentReading: reading.currentReading },
      });
    } else if (r.billingUnit === 'PERSON') {
      if (assigned.has(r.code)) {
        if (occupantCount === null) missing.push({ code: r.code, reason: 'OCCUPANT_COUNT_MISSING' });
        else add('SERVICE', r.code, r.name, 'người', occupantCount.toFixed(3), r.unitPrice, occupantCount * Number(r.unitPrice));
      }
    } else if (assigned.has(r.code)) {
      add('SERVICE', r.code, r.name, r.billingUnit === 'ROOM' ? 'phòng' : 'lần', '1.000', r.unitPrice, Number(r.unitPrice));
    }
  }
  return { items, missing };
}

export const invoicesMock: InvoicesApi = {
  async listInvoices(ws, buildingId, f, page) {
    await simulate();
    scope(ws, buildingId);
    const all = invoices
      .filter((i) => i.workspaceId === ws && i.buildingId === buildingId)
      .filter((i) => (!f.status || i.status === f.status) && (!f.period || i.period === f.period) && (!f.roomId || i.roomId === f.roomId) && (!f.contractId || i.contractId === f.contractId))
      .sort((a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt));
    return { items: all.slice((page.page - 1) * page.limit, page.page * page.limit).map(strip), page: page.page, limit: page.limit, total: all.length };
  },

  async createInvoice(ws, buildingId, input) {
    await simulate();
    scope(ws, buildingId);
    const contract = await tenancyMock.getContract(ws, input.contractId).catch(() => fail(404, 'CONTRACT_NOT_FOUND', 'Contract not found'));
    if (contract.buildingId !== buildingId) fail(404, 'CONTRACT_NOT_FOUND', 'Contract not found');
    if (contract.phase === 'CANCELLED') fail(409, 'INVOICE_PERIOD_INVALID', 'Contract cancelled');
    const from = periodStart(input.period);
    const to = periodEnd(input.period);
    if (contract.startDate > to || contract.endDate < from) fail(409, 'INVOICE_PERIOD_INVALID', 'Contract not in effect');
    if (invoices.some((i) => i.contractId === contract.id && i.period === input.period)) fail(409, 'INVOICE_DUPLICATE', 'Invoice exists');
    const { items, missing } = await compute(ws, buildingId, contract, input.period, input.occupantCount ?? null);
    const t = now();
    const inv: StoredInvoice = {
      id: nextId('inv'), workspaceId: ws, buildingId, roomId: contract.roomId, contractId: contract.id, period: input.period, status: 'DRAFT', tenantId: contract.tenantId,
      occupantCount: input.occupantCount ?? null, occupantCountConfirmedBy: input.occupantCount !== undefined ? 'mock-owner' : null, occupantCountConfirmedAt: input.occupantCount !== undefined ? t : null,
      billsVehicles: input.billVehicles ?? true, dueDate: input.dueDate ?? null, notes: input.notes ?? null, missingItems: missing, isComplete: missing.length === 0,
      totalAmount: null, provisionalAmount: null, roundingRule: 'ROUND_HALF_UP_1_VND', adjustmentsTotal: null, adjustedTotal: null, paidTotal: null, outstanding: null, paymentStatus: null,
      items, issuedAt: null, createdAt: t, updatedAt: t, _confirmedAt: null,
    };
    refreshTotals(inv);
    invoices.push(inv);
    return strip(inv);
  },

  async getInvoice(ws, buildingId, invoiceId) {
    await simulate();
    scope(ws, buildingId);
    return strip(findStoredInvoice(ws, buildingId, invoiceId));
  },

  async updateInvoice(ws, buildingId, invoiceId, patch: UpdateInvoiceRequest) {
    await simulate();
    scope(ws, buildingId);
    const inv = findStoredInvoice(ws, buildingId, invoiceId);
    if (inv.status !== 'DRAFT') fail(409, 'INVOICE_NOT_EDITABLE', 'Only DRAFT invoices can change');
    const contract = await tenancyMock.getContract(ws, inv.contractId);
    if (patch.occupantCount !== undefined) {
      inv.occupantCount = patch.occupantCount;
      inv.occupantCountConfirmedBy = 'mock-owner';
      inv.occupantCountConfirmedAt = now();
    }
    if (patch.billVehicles !== undefined) inv.billsVehicles = patch.billVehicles;
    if (patch.dueDate) inv.dueDate = patch.dueDate;
    if (patch.notes !== undefined) inv.notes = patch.notes;
    const { items, missing } = await compute(ws, buildingId, contract, inv.period, inv.occupantCount);
    inv.items = items;
    inv.missingItems = missing;
    inv.isComplete = missing.length === 0;
    inv.updatedAt = now();
    refreshTotals(inv);
    return strip(inv);
  },

  async issueInvoice(ws, buildingId, invoiceId) {
    await simulate();
    scope(ws, buildingId);
    const inv = findStoredInvoice(ws, buildingId, invoiceId);
    if (inv.status !== 'DRAFT') fail(409, 'INVOICE_NOT_EDITABLE', 'Only DRAFT invoices can change');
    const contract = await tenancyMock.getContract(ws, inv.contractId);
    const { items, missing } = await compute(ws, buildingId, contract, inv.period, inv.occupantCount);
    inv.items = items;
    inv.missingItems = missing;
    inv.isComplete = missing.length === 0;
    if (missing.length > 0) {
      refreshTotals(inv);
      fail(409, 'INVOICE_INCOMPLETE', 'Invoice is incomplete');
    }
    inv.status = 'ISSUED';
    inv.issuedAt = now();
    inv.updatedAt = inv.issuedAt;
    refreshTotals(inv);
    return strip(inv);
  },

  async deleteInvoice(ws, buildingId, invoiceId) {
    await simulate();
    scope(ws, buildingId);
    const inv = findStoredInvoice(ws, buildingId, invoiceId);
    if (inv.status !== 'DRAFT') fail(409, 'INVOICE_NOT_EDITABLE', 'Only DRAFT invoices can change');
    invoices.splice(invoices.indexOf(inv), 1);
  },

  async createAdjustment(ws, buildingId, invoiceId, input: CreateInvoiceAdjustmentRequest) {
    await simulate();
    const user = scope(ws, buildingId);
    const inv = findStoredInvoice(ws, buildingId, invoiceId);
    const requested = input.amount.trim();
    const existing = adjustments.find((a) => a.invoiceId === invoiceId && a.key === input.idempotencyKey);
    if (existing) {
      const same = existing.requestedAmount === Number(requested).toFixed(4) && existing.reason === input.reason.trim() && existing.referenceAdjustmentId === (input.referenceAdjustmentId ?? null);
      if (!same) fail(409, 'INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT', 'Idempotency key reused');
      return stripAdj(existing);
    }
    if (inv.status !== 'ISSUED') fail(409, 'INVOICE_ADJUSTMENT_NOT_ELIGIBLE', 'Only ISSUED invoices can be adjusted');
    const rounded = Math.round(Number(requested)); // làm tròn 1 đồng
    if (rounded === 0) fail(409, 'INVOICE_ADJUSTMENT_INVALID', 'Zero adjustment');
    if (input.referenceAdjustmentId) {
      const ref = adjustments.find((a) => a.id === input.referenceAdjustmentId && a.invoiceId === invoiceId);
      if (!ref || adjustments.some((a) => a.referenceAdjustmentId === ref.id)) fail(409, 'INVOICE_ADJUSTMENT_INVALID', 'Invalid reference');
    }
    const total = Number(inv.totalAmount) + adjustmentSum(invoiceId) + rounded;
    if (total < 0) fail(409, 'INVOICE_ADJUSTMENT_INVALID', 'Negative total');
    if (total < paidOf(invoiceId)) fail(409, 'INVOICE_ADJUSTMENT_BELOW_PAID', 'Below money already received');
    const adj = {
      id: nextId('adj'), workspaceId: ws, invoiceId, amount: whole(rounded), requestedAmount: Number(requested).toFixed(4), reason: input.reason.trim(),
      referenceAdjustmentId: input.referenceAdjustmentId ?? null, createdBy: user.id, createdAt: now(), key: input.idempotencyKey, buildingId,
    };
    adjustments.push(adj);
    refreshTotals(inv);
    return stripAdj(adj);
  },

  async listAdjustments(ws, buildingId, invoiceId, page) {
    await simulate();
    scope(ws, buildingId);
    return adjustmentPage(findStoredInvoice(ws, buildingId, invoiceId), page);
  },

  async getAdjustment(ws, buildingId, invoiceId, adjustmentId) {
    await simulate();
    scope(ws, buildingId);
    findStoredInvoice(ws, buildingId, invoiceId);
    const a = adjustments.find((x) => x.id === adjustmentId && x.invoiceId === invoiceId) ?? fail(404, 'INVOICE_ADJUSTMENT_NOT_FOUND', 'Adjustment not found');
    return stripAdj(a);
  },
};

function stripAdj(a: InvoiceAdjustmentResponse & { key: string; buildingId: string }): InvoiceAdjustmentResponse {
  const { key, buildingId, ...rest } = a;
  void key;
  void buildingId;
  return rest;
}

/** Một trang sổ điều chỉnh của hóa đơn kèm tổng toàn hóa đơn (không phải tổng của riêng trang); dùng chung cho chủ trọ và người thuê. */
export function adjustmentPage(inv: StoredInvoice, page: { page: number; limit: number }): InvoiceAdjustmentPageResponse {
  const all = adjustmentsOf(inv.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const original = inv.items.reduce((s, x) => s + Number(x.amount), 0);
  const sum = adjustmentSum(inv.id);
  return {
    items: all.slice((page.page - 1) * page.limit, page.page * page.limit).map(stripAdj),
    page: page.page, limit: page.limit, total: all.length,
    originalTotal: whole(original), adjustmentsTotal: whole(sum), adjustedTotal: whole(original + sum),
  };
}
