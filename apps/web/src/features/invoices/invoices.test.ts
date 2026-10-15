import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceAdjustmentResponse, InvoiceResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { db } from '@/mocks/db';
import { ApiError } from '@/services/http/ApiError';
import { invoicesMock } from '@/mocks/handlers/invoices.mock';
import { utilitiesMock } from '@/mocks/handlers/utilities.mock';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { invoicesHttp } from './api';
import apiSource from './api.ts?raw';
import hooksSource from './hooks.ts?raw';
import pagesSource from '../../pages/workspace/InvoicePages.tsx?raw';
import { INVOICE_STATUS, MISSING_REASON, PAYMENT_STATUS, invoiceErrorMessage } from './labels';
import { boolToTri, canIssue, diffUpdate, formatSignedMoney, invoiceAmount, newIdempotencyKey, toAdjustmentBody, toCreateBody, triToBool } from './mappers';
import { adjustmentSchema, createInvoiceSchema, updateInvoiceSchema } from './schemas';

const WS = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const INV = '44444444-4444-4444-8444-444444444444';
const ADJ = '55555555-5555-4555-8555-555555555555';

const invoice = (o: Partial<InvoiceResponse> = {}): InvoiceResponse => ({
  id: INV, workspaceId: WS, buildingId: B, roomId: 'r', contractId: 'c', period: '2026-10', status: 'DRAFT', tenantId: 't',
  occupantCount: null, occupantCountConfirmedBy: null, occupantCountConfirmedAt: null, billsVehicles: null, dueDate: null, notes: null,
  missingItems: [], isComplete: true, totalAmount: null, provisionalAmount: '3000000', roundingRule: 'ROUND_HALF_UP_1_VND',
  adjustmentsTotal: null, adjustedTotal: null, paidTotal: null, outstanding: null, paymentStatus: null, items: [], issuedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...o,
});
const adjustment = (o: Partial<InvoiceAdjustmentResponse> = {}): InvoiceAdjustmentResponse => ({
  id: ADJ, workspaceId: WS, invoiceId: INV, amount: '-50000', requestedAmount: '-50000.0000', reason: 'Giảm', referenceAdjustmentId: null, createdBy: 'u', createdAt: '2026-10-02T00:00:00.000Z', ...o,
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('invoice statuses are DRAFT/ISSUED only; payment status is separate', () => {
  it('labels cover exactly the backend values', () => {
    expect(Object.keys(INVOICE_STATUS)).toEqual(['DRAFT', 'ISSUED']);
    expect(Object.keys(PAYMENT_STATUS)).toEqual(['UNPAID', 'PARTIALLY_PAID', 'PAID']);
    expect(Object.keys(MISSING_REASON).sort()).toEqual(
      ['METER_READING_MISSING', 'OCCUPANT_COUNT_MISSING', 'RATE_CHANGE_NOT_SPLITTABLE', 'RATE_MISSING', 'RATE_PERIOD_MISMATCH', 'RATE_SEGMENT_CONSUMPTION_UNKNOWN', 'RATE_UNIT_UNSUPPORTED', 'VEHICLE_BILLING_AMBIGUOUS', 'WATER_METHOD_CONFLICT'],
    );
  });
  it('shows the final total once issued and the provisional amount while DRAFT; only complete drafts can be issued', () => {
    expect(invoiceAmount(invoice())).toBe('3000000');
    expect(invoiceAmount(invoice({ status: 'ISSUED', totalAmount: '2900000', provisionalAmount: null }))).toBe('2900000');
    expect(canIssue(invoice())).toBe(true);
    expect(canIssue(invoice({ isComplete: false }))).toBe(false);
    expect(canIssue(invoice({ status: 'ISSUED' }))).toBe(false);
  });
  it('formats signed adjustment amounts', () => {
    const sp = (t: string) => t.replace(/\s/g, ' '); // Intl dùng khoảng trắng không ngắt
    expect(sp(formatSignedMoney('-50000'))).toBe('−50.000 ₫');
    expect(sp(formatSignedMoney('20000'))).toBe('+20.000 ₫');
    expect(formatSignedMoney('x')).toBe('—');
  });
});

describe('request bodies only carry what the user decided', () => {
  it('create: contract + period always, optionals only when entered', () => {
    expect(toCreateBody({ contractId: 'c', period: '2026-10' })).toEqual({ contractId: 'c', period: '2026-10' });
    expect(toCreateBody({ contractId: 'c', period: '2026-10', occupantCount: ' 3 ', billVehicles: 'false', dueDate: '2026-11-05', notes: ' ghi chú ' })).toEqual({
      contractId: 'c', period: '2026-10', occupantCount: 3, billVehicles: false, dueDate: '2026-11-05', notes: 'ghi chú',
    });
    expect(toCreateBody({ contractId: 'c', period: '2026-10', occupantCount: '0' }).occupantCount).toBe(0);
  });
  it('update: sends only changed fields; unchanged form sends {} (a pure recalculation)', () => {
    const cur = invoice({ occupantCount: 2, billsVehicles: true, dueDate: '2026-11-05', notes: 'a' });
    expect(diffUpdate(cur, { occupantCount: '2', billVehicles: 'true', dueDate: '2026-11-05', notes: 'a' })).toEqual({});
    expect(diffUpdate(cur, { occupantCount: '3', billVehicles: 'false', dueDate: '2026-11-10', notes: 'b' })).toEqual({ occupantCount: 3, billVehicles: false, dueDate: '2026-11-10', notes: 'b' });
    // blank fields the backend cannot clear are not sent
    expect(diffUpdate(cur, { occupantCount: '', billVehicles: '', dueDate: '', notes: 'a' })).toEqual({});
    expect(diffUpdate(invoice(), { occupantCount: '', billVehicles: '', dueDate: '', notes: '' })).toEqual({});
  });
  it('tri-state helpers', () => {
    expect(triToBool('')).toBeUndefined();
    expect(triToBool('true')).toBe(true);
    expect(boolToTri(null)).toBe('');
    expect(boolToTri(false)).toBe('false');
  });
  it('adjustment body + a stable, backend-valid idempotency key', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(/^[A-Za-z0-9_.:-]{8,100}$/);
    expect(newIdempotencyKey()).not.toBe(key);
    expect(toAdjustmentBody({ amount: ' -50000 ', reason: ' giảm ', idempotencyKey: key })).toEqual({ amount: '-50000', reason: 'giảm', idempotencyKey: key });
    expect(toAdjustmentBody({ amount: '1', reason: 'x', idempotencyKey: key, referenceAdjustmentId: ADJ }).referenceAdjustmentId).toBe(ADJ);
  });
});

describe('validation follows the DTOs', () => {
  const base = { contractId: 'c', period: '2026-10', occupantCount: '', billVehicles: '', dueDate: '', notes: '' };
  it('create', () => {
    expect(createInvoiceSchema.safeParse(base).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...base, contractId: '' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, period: '2026-13' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, occupantCount: '101' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, occupantCount: '100' }).success).toBe(true);
    expect(createInvoiceSchema.safeParse({ ...base, occupantCount: '-1' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, occupantCount: '1.5' }).success).toBe(false);
    expect(createInvoiceSchema.safeParse({ ...base, notes: 'x'.repeat(1001) }).success).toBe(false);
  });
  it('update', () => {
    expect(updateInvoiceSchema.safeParse({ occupantCount: '4', billVehicles: 'true', dueDate: '2026-11-05', notes: '' }).success).toBe(true);
    expect(updateInvoiceSchema.safeParse({ occupantCount: 'abc', billVehicles: '', dueDate: '', notes: '' }).success).toBe(false);
    expect(updateInvoiceSchema.safeParse({ occupantCount: '', billVehicles: 'maybe', dueDate: '', notes: '' }).success).toBe(false);
  });
  it('adjustment: signed money, never zero, reason required (<=500), key format', () => {
    const ok = { amount: '-50000', reason: 'Giảm', referenceAdjustmentId: '', idempotencyKey: 'adj-12345678' };
    expect(adjustmentSchema.safeParse(ok).success).toBe(true);
    expect(adjustmentSchema.safeParse({ ...ok, amount: '20000.5' }).success).toBe(true);
    expect(adjustmentSchema.safeParse({ ...ok, amount: '0' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, amount: '-0.0000' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, amount: '1.23456' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, amount: '12345678901' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, amount: '+5' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, reason: '  ' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, reason: 'x'.repeat(501) }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, idempotencyKey: 'short' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...ok, idempotencyKey: 'bad key with spaces' }).success).toBe(false);
  });
});

describe('HTTP adapter: the 9 OWNER endpoints, always under workspace → building', () => {
  const base = `/workspaces/${WS}/buildings/${B}/invoices`;
  it('list passes only the supported query (no q) with real pagination', async () => {
    http.get.mockResolvedValue({ items: [], page: 2, limit: 20, total: 0 });
    await invoicesHttp.listInvoices(WS, B, { status: 'ISSUED', period: '2026-10', roomId: 'r', contractId: 'c' }, { page: 2, limit: 20 });
    expect(http.get).toHaveBeenCalledWith(base, { query: { status: 'ISSUED', period: '2026-10', roomId: 'r', contractId: 'c', page: 2, limit: 20 } });
    const query = http.get.mock.calls[0]![1].query as Record<string, unknown>;
    expect(Object.keys(query)).not.toContain('q');
  });
  it('create / get / update / issue / delete', async () => {
    http.post.mockResolvedValue(invoice());
    await invoicesHttp.createInvoice(WS, B, { contractId: 'c', period: '2026-10' });
    expect(http.post).toHaveBeenLastCalledWith(base, { contractId: 'c', period: '2026-10' });
    http.get.mockResolvedValue(invoice());
    await invoicesHttp.getInvoice(WS, B, INV);
    expect(http.get).toHaveBeenLastCalledWith(`${base}/${INV}`);
    http.patch.mockResolvedValue(invoice());
    await invoicesHttp.updateInvoice(WS, B, INV, { occupantCount: 2 });
    expect(http.patch).toHaveBeenLastCalledWith(`${base}/${INV}`, { occupantCount: 2 });
    await invoicesHttp.updateInvoice(WS, B, INV, {});
    expect(http.patch).toHaveBeenLastCalledWith(`${base}/${INV}`, {});
    http.post.mockResolvedValue(invoice({ status: 'ISSUED' }));
    await invoicesHttp.issueInvoice(WS, B, INV);
    expect(http.post).toHaveBeenLastCalledWith(`${base}/${INV}/issue`);
    http.delete.mockResolvedValue(undefined);
    await expect(invoicesHttp.deleteInvoice(WS, B, INV)).resolves.toBeUndefined();
    expect(http.delete).toHaveBeenCalledWith(`${base}/${INV}`);
  });
  it('adjustments: create (body incl. idempotency + reference), list (paged), detail', async () => {
    http.post.mockResolvedValue(adjustment());
    await invoicesHttp.createAdjustment(WS, B, INV, { amount: '-50000', reason: 'Giảm', idempotencyKey: 'adj-12345678', referenceAdjustmentId: ADJ });
    expect(http.post).toHaveBeenCalledWith(`${base}/${INV}/adjustments`, { amount: '-50000', reason: 'Giảm', idempotencyKey: 'adj-12345678', referenceAdjustmentId: ADJ });
    http.get.mockResolvedValue({ items: [adjustment()], page: 1, limit: 10, total: 1, originalTotal: '3000000', adjustmentsTotal: '-50000', adjustedTotal: '2950000' });
    const page = await invoicesHttp.listAdjustments(WS, B, INV, { page: 1, limit: 10 });
    expect(http.get).toHaveBeenLastCalledWith(`${base}/${INV}/adjustments`, { query: { page: 1, limit: 10 } });
    expect(page.adjustedTotal).toBe('2950000');
    http.get.mockResolvedValue(adjustment());
    await invoicesHttp.getAdjustment(WS, B, INV, ADJ);
    expect(http.get).toHaveBeenLastCalledWith(`${base}/${INV}/adjustments/${ADJ}`);
  });
  it('never uses legacy workspace-level or bulk billing endpoints', async () => {
    http.get.mockResolvedValue({ items: [] });
    http.post.mockResolvedValue({});
    http.patch.mockResolvedValue({});
    http.delete.mockResolvedValue(undefined);
    await invoicesHttp.listInvoices(WS, B, {}, { page: 1, limit: 20 });
    await invoicesHttp.createInvoice(WS, B, { contractId: 'c', period: '2026-10' });
    await invoicesHttp.issueInvoice(WS, B, INV);
    await invoicesHttp.deleteInvoice(WS, B, INV);
    const urls = [...http.get.mock.calls, ...http.post.mock.calls, ...http.patch.mock.calls, ...http.delete.mock.calls].map((c) => String(c[0]));
    for (const url of urls) {
      expect(url).toContain(`/buildings/${B}/invoices`);
      expect(url).not.toMatch(/\/billing\/|\/tenant\//);
    }
  });
  it('FE-06B screens do not import the legacy billing model or call its endpoints', () => {
    for (const [name, text] of Object.entries({ 'features/invoices/api.ts': apiSource, 'features/invoices/hooks.ts': hooksSource, 'pages/workspace/InvoicePages.tsx': pagesSource })) {
      expect(text, name).not.toMatch(/features\/billing|\/billing\/(preview|run)/);
    }
  });
});

describe('error messages follow the backend codes', () => {
  const err = (code?: string, statusCode = 409) => new ApiError({ statusCode, code, message: 'raw' });
  it('maps domain codes', () => {
    expect(invoiceErrorMessage(err('INVOICE_DUPLICATE'))).toMatch(/đã có hóa đơn/);
    expect(invoiceErrorMessage(err('INVOICE_INCOMPLETE'))).toMatch(/còn thiếu/);
    expect(invoiceErrorMessage(err('INVOICE_NOT_EDITABLE'))).toMatch(/Chỉ bản nháp/);
    expect(invoiceErrorMessage(err('INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT'))).toMatch(/Mã chống gửi trùng/);
    expect(invoiceErrorMessage(err('INVOICE_ADJUSTMENT_NOT_ELIGIBLE'))).toMatch(/đã phát hành/);
    expect(invoiceErrorMessage(err('INVOICE_ADJUSTMENT_BELOW_PAID'))).toMatch(/số tiền đã nhận/);
    expect(invoiceErrorMessage(err('UNKNOWN'))).toBe('raw');
    expect(invoiceErrorMessage(err(undefined, 401))).toMatch(/đăng nhập lại/);
  });
});

describe('mock follows the backend workflow (DRAFT → complete → ISSUED → adjustments)', () => {
  const ws = db.tenants[0]!.workspaceId;
  const as = (role = 'OWNER') => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role, status: 'ACTIVE', name: 'WS' }] };
  };
  const pick = async () => {
    const list = await tenancyMock.listContracts(ws);
    const c = list.find((x) => x.phase === 'IN_EFFECT' && x.buildingId)!;
    return { c, b: c.buildingId, period: c.startDate.slice(0, 7) };
  };
  const day = (o: number) => new Date(Date.now() + o * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);

  it('OWNER only; unknown building/contract are 404', async () => {
    as('OWNER');
    const { c, b } = await pick();
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(invoicesMock.listInvoices(ws, b, {}, { page: 1, limit: 20 })).rejects.toBeInstanceOf(ApiError);
    }
    as('OWNER');
    await expect(invoicesMock.listInvoices(ws, 'nope', {}, { page: 1, limit: 20 })).rejects.toMatchObject({ code: 'BUILDING_NOT_FOUND' });
    await expect(invoicesMock.createInvoice(ws, b, { contractId: 'missing', period: c.startDate.slice(0, 7) })).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
  });

  it('create is a DRAFT with missing data; duplicate and out-of-contract periods are refused; incomplete cannot be issued', async () => {
    as('OWNER');
    const { c, b, period } = await pick();
    const draft = await invoicesMock.createInvoice(ws, b, { contractId: c.id, period });
    expect(draft).toMatchObject({ status: 'DRAFT', isComplete: false, paymentStatus: null, totalAmount: null, adjustmentsTotal: null, paidTotal: null });
    expect(draft.provisionalAmount).not.toBeNull();
    expect(draft.missingItems.some((m) => m.reason === 'METER_READING_MISSING')).toBe(true);
    expect(draft.items.some((i) => i.itemType === 'RENT')).toBe(true);
    await expect(invoicesMock.createInvoice(ws, b, { contractId: c.id, period })).rejects.toMatchObject({ code: 'INVOICE_DUPLICATE' });
    await expect(invoicesMock.createInvoice(ws, b, { contractId: c.id, period: '1999-01' })).rejects.toMatchObject({ code: 'INVOICE_PERIOD_INVALID' });
    await expect(invoicesMock.issueInvoice(ws, b, draft.id)).rejects.toMatchObject({ code: 'INVOICE_INCOMPLETE' });
    const listed = await invoicesMock.listInvoices(ws, b, { status: 'DRAFT', period, contractId: c.id }, { page: 1, limit: 20 });
    expect(listed.items.map((i) => i.id)).toContain(draft.id);
    expect(listed.total).toBeGreaterThan(0);
    // a draft can be deleted; then the same period can be created again
    await invoicesMock.deleteInvoice(ws, b, draft.id);
    await expect(invoicesMock.getInvoice(ws, b, draft.id)).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND' });
    const again = await invoicesMock.createInvoice(ws, b, { contractId: c.id, period });
    await invoicesMock.deleteInvoice(ws, b, again.id);
  });

  it('supplying meter readings then PATCH recalculates; issue freezes the total; ISSUED cannot be edited or deleted', async () => {
    as('OWNER');
    const { c, b, period } = await pick();
    const draft = await invoicesMock.createInvoice(ws, b, { contractId: c.id, period, dueDate: day(10) });
    for (const meterType of ['ELECTRICITY', 'WATER'] as const) {
      await utilitiesMock.recordMeterReading(ws, b, c.roomId, { meterType, period, previousReading: '10', currentReading: '30' });
    }
    expect((await invoicesMock.getInvoice(ws, b, draft.id)).isComplete).toBe(false); // nothing changes until PATCH
    const recalculated = await invoicesMock.updateInvoice(ws, b, draft.id, {});
    expect(recalculated.isComplete).toBe(true);
    expect(recalculated.items.some((i) => i.itemType === 'ELECTRICITY')).toBe(true);
    const edited = await invoicesMock.updateInvoice(ws, b, draft.id, { occupantCount: 2, notes: 'Ghi chú' });
    expect(edited).toMatchObject({ occupantCount: 2, notes: 'Ghi chú' });
    const issued = await invoicesMock.issueInvoice(ws, b, draft.id);
    expect(issued).toMatchObject({ status: 'ISSUED', provisionalAmount: null, paymentStatus: 'UNPAID', paidTotal: '0', adjustmentsTotal: '0' });
    expect(issued.totalAmount).toBe(recalculated.provisionalAmount);
    expect(issued.outstanding).toBe(issued.totalAmount);
    await expect(invoicesMock.updateInvoice(ws, b, draft.id, { notes: 'x' })).rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE' });
    await expect(invoicesMock.deleteInvoice(ws, b, draft.id)).rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE' });
    await expect(invoicesMock.issueInvoice(ws, b, draft.id)).rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE' });
  });

  it('adjustments: ISSUED only, signed, idempotent replay vs conflict, correction reference, totals from the backend', async () => {
    as('OWNER');
    const { c, b } = await pick();
    const period = c.startDate.slice(0, 7);
    const issued = (await invoicesMock.listInvoices(ws, b, { status: 'ISSUED', contractId: c.id, period }, { page: 1, limit: 20 })).items[0]!;
    const drafty = await invoicesMock.createInvoice(ws, b, { contractId: c.id, period: addPeriod(period) }).catch(() => null);
    if (drafty) {
      await expect(invoicesMock.createAdjustment(ws, b, drafty.id, { amount: '1000', reason: 'x', idempotencyKey: 'key-00000001' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_NOT_ELIGIBLE' });
    }
    await expect(invoicesMock.createAdjustment(ws, b, issued.id, { amount: '0', reason: 'x', idempotencyKey: 'key-00000002' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_INVALID' });
    await expect(invoicesMock.createAdjustment(ws, b, issued.id, { amount: '0.4', reason: 'x', idempotencyKey: 'key-00000003' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_INVALID' });
    await expect(invoicesMock.createAdjustment(ws, b, issued.id, { amount: `-${Number(issued.totalAmount) + 1}`, reason: 'x', idempotencyKey: 'key-00000004' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_INVALID' });
    const first = await invoicesMock.createAdjustment(ws, b, issued.id, { amount: '-50000', reason: 'Giảm giá', idempotencyKey: 'key-retry-0001' });
    expect(first).toMatchObject({ amount: '-50000', requestedAmount: '-50000.0000', referenceAdjustmentId: null });
    // identical retry returns the original; the same key with other content conflicts
    const replay = await invoicesMock.createAdjustment(ws, b, issued.id, { amount: '-50000', reason: 'Giảm giá', idempotencyKey: 'key-retry-0001' });
    expect(replay.id).toBe(first.id);
    await expect(invoicesMock.createAdjustment(ws, b, issued.id, { amount: '-60000', reason: 'Giảm giá', idempotencyKey: 'key-retry-0001' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_IDEMPOTENCY_CONFLICT' });
    // rounding to 1 VND keeps what was requested
    const rounded = await invoicesMock.createAdjustment(ws, b, issued.id, { amount: '1000.6', reason: 'Làm tròn', idempotencyKey: 'key-round-0001' });
    expect(rounded).toMatchObject({ amount: '1001', requestedAmount: '1000.6000' });
    // correction references the earlier record; a record can be corrected only once; unknown reference refused
    const fix = await invoicesMock.createAdjustment(ws, b, issued.id, { amount: '50000', reason: 'Hoàn lại', idempotencyKey: 'key-fix-00001', referenceAdjustmentId: first.id });
    expect(fix.referenceAdjustmentId).toBe(first.id);
    await expect(invoicesMock.createAdjustment(ws, b, issued.id, { amount: '1', reason: 'x', idempotencyKey: 'key-fix-00002', referenceAdjustmentId: first.id })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_INVALID' });
    await expect(invoicesMock.createAdjustment(ws, b, issued.id, { amount: '1', reason: 'x', idempotencyKey: 'key-fix-00003', referenceAdjustmentId: 'nope' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_INVALID' });
    const page = await invoicesMock.listAdjustments(ws, b, issued.id, { page: 1, limit: 2 });
    expect(page).toMatchObject({ page: 1, limit: 2, total: 3, originalTotal: issued.totalAmount, adjustmentsTotal: '1001' });
    expect(page.items).toHaveLength(2);
    expect(Number(page.adjustedTotal)).toBe(Number(issued.totalAmount) + 1001);
    expect((await invoicesMock.listAdjustments(ws, b, issued.id, { page: 2, limit: 2 })).items).toHaveLength(1);
    expect(await invoicesMock.getAdjustment(ws, b, issued.id, first.id)).toMatchObject({ id: first.id, reason: 'Giảm giá' });
    await expect(invoicesMock.getAdjustment(ws, b, issued.id, 'missing')).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_NOT_FOUND' });
    const refreshed = await invoicesMock.getInvoice(ws, b, issued.id);
    expect(refreshed.adjustmentsTotal).toBe('1001');
    expect(refreshed.status).toBe('ISSUED'); // payment status is not an invoice status
  });
});

function addPeriod(p: string) {
  const [y = 2026, m = 1] = p.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
