import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoicePaymentResponse } from '@rental/shared';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
const session = vi.hoisted(() => ({ record: null as unknown }));

vi.mock('@/services/http/httpClient', () => ({ httpClient: http }));
vi.mock('@/mocks/mockUtils', () => ({ simulate: async () => ({ empty: false }), notFound: () => { throw new Error('nf'); } }));
vi.mock('@/mocks/handlers/auth.mock', () => ({ requireSession: () => session.record, currentMockUser: () => null }));

import { db } from '@/mocks/db';
import { ApiError } from '@/services/http/ApiError';
import { invoicesMock } from '@/mocks/handlers/invoices.mock';
import { paymentsMock } from '@/mocks/handlers/payments.mock';
import { utilitiesMock } from '@/mocks/handlers/utilities.mock';
import { tenancyMock } from '@/mocks/handlers/tenancy.mock';
import { useIdempotencyKey } from '@/lib/idempotency';
import { paymentsHttp } from './api';
import apiSource from './api.ts?raw';
import hooksSource from './hooks.ts?raw';
import pagesSource from '../../pages/workspace/SettlementPages.tsx?raw';
import { PAYMENT_ENTRY_KIND, paymentErrorMessage } from './labels';
import { isoToLocalInput, localInputToIso, notInFuture, paymentSchema, reverseSchema, toPaymentBody } from './schemas';

const WS = '11111111-1111-4111-8111-111111111111';
const B = '33333333-3333-4333-8333-333333333333';
const INV = '44444444-4444-4444-8444-444444444444';
const PAY = '55555555-5555-4555-8555-555555555555';
const payment = (o: Partial<InvoicePaymentResponse> = {}): InvoicePaymentResponse => ({
  id: PAY, workspaceId: WS, invoiceId: INV, kind: 'PAYMENT', amount: '500000', method: 'CASH', receivedAt: '2026-10-10T03:00:00.000Z',
  note: null, reversesPaymentId: null, reversedByPaymentId: null, confirmedBy: 'u', createdAt: '2026-10-10T03:00:00.000Z', ...o,
});

beforeEach(() => {
  for (const fn of Object.values(http)) fn.mockReset();
});

describe('payment form follows the DTO', () => {
  const now = isoToLocalInput();
  const ok = { amount: '500000', method: 'CASH', receivedAt: now, note: '' };
  it('amount: whole VND > 0, at most 12 digits', () => {
    expect(paymentSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['0', '-1', '1.5', '01', '', '1234567890123', 'abc']) expect(paymentSchema.safeParse({ ...ok, amount: bad }).success, bad).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, amount: '123456789012' }).success).toBe(true);
  });
  it('method is CASH or BANK_TRANSFER only', () => {
    expect(paymentSchema.safeParse({ ...ok, method: 'BANK_TRANSFER' }).success).toBe(true);
    expect(paymentSchema.safeParse({ ...ok, method: 'CARD' }).success).toBe(false);
  });
  it('receivedAt may not be in the future (5 minute tolerance like the backend)', () => {
    const base = Date.parse('2026-10-15T10:00:00.000Z');
    const local = (ms: number) => isoToLocalInput(new Date(ms));
    expect(notInFuture(local(base + 4 * 60_000), base)).toBe(true);
    expect(notInFuture(local(base + 10 * 60_000), base)).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, receivedAt: isoToLocalInput(new Date(Date.now() + 3_600_000)) }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, receivedAt: '' }).success).toBe(false);
    expect(localInputToIso('not-a-date')).toBeNull();
  });
  it('note <= 500; reverse needs a reason <= 500', () => {
    expect(paymentSchema.safeParse({ ...ok, note: 'x'.repeat(501) }).success).toBe(false);
    expect(reverseSchema.safeParse({ reason: 'Ghi nhầm' }).success).toBe(true);
    expect(reverseSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(reverseSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
  });
  it('body: ISO datetime, trimmed, note only when entered, key carried through', () => {
    const body = toPaymentBody({ amount: ' 500000 ', method: 'BANK_TRANSFER', receivedAt: '2026-10-10T10:00', note: ' ck ' }, 'pay-12345678');
    expect(body).toMatchObject({ amount: '500000', method: 'BANK_TRANSFER', note: 'ck', idempotencyKey: 'pay-12345678' });
    expect(body.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(toPaymentBody({ amount: '1', method: 'CASH', receivedAt: '2026-10-10T10:00', note: '' }, 'pay-12345678')).not.toHaveProperty('note');
  });
});

describe('idempotency key: stable for the same intent, new when the content changes', () => {
  it('keeps the key across retries and renews it on edited content', () => {
    const { result } = renderHook(() => useIdempotencyKey('pay'));
    const k1 = result.current('a|1');
    expect(k1).toMatch(/^pay-[A-Za-z0-9_.:-]{8,}$/);
    expect(result.current('a|1')).toBe(k1); // retry after a failure
    const k2 = result.current('a|2'); // user edited the amount: a new intent
    expect(k2).not.toBe(k1);
    expect(result.current('a|2')).toBe(k2);
  });
});

describe('HTTP adapter: the 4 OWNER payment endpoints under workspace → building → invoice', () => {
  const base = `/workspaces/${WS}/buildings/${B}/invoices/${INV}/payments`;
  it('list (paged) / create / detail / reverse', async () => {
    http.get.mockResolvedValue({ items: [payment()], page: 2, limit: 20, total: 21, amountDue: '1000000', paidTotal: '500000', outstanding: '500000', paymentStatus: 'PARTIALLY_PAID' });
    const page = await paymentsHttp.listPayments(WS, B, INV, { page: 2, limit: 20 });
    expect(http.get).toHaveBeenLastCalledWith(base, { query: { page: 2, limit: 20 } });
    expect(page).toMatchObject({ amountDue: '1000000', outstanding: '500000', paymentStatus: 'PARTIALLY_PAID' });
    http.post.mockResolvedValue(payment());
    await paymentsHttp.recordPayment(WS, B, INV, { amount: '500000', method: 'CASH', receivedAt: '2026-10-10T03:00:00.000Z', idempotencyKey: 'pay-12345678' });
    expect(http.post).toHaveBeenLastCalledWith(base, { amount: '500000', method: 'CASH', receivedAt: '2026-10-10T03:00:00.000Z', idempotencyKey: 'pay-12345678' });
    http.get.mockResolvedValue(payment());
    await paymentsHttp.getPayment(WS, B, INV, PAY);
    expect(http.get).toHaveBeenLastCalledWith(`${base}/${PAY}`);
    await paymentsHttp.reversePayment(WS, B, INV, PAY, { reason: 'Ghi nhầm', idempotencyKey: 'rev-12345678' });
    expect(http.post).toHaveBeenLastCalledWith(`${base}/${PAY}/reverse`, { reason: 'Ghi nhầm', idempotencyKey: 'rev-12345678' });
  });
  it('FE-06C payment screens use no global, pending/confirm/reject or proof-upload endpoint or model', () => {
    for (const [name, text] of Object.entries({ api: apiSource, hooks: hooksSource })) {
      expect(text, name).not.toMatch(/features\/billing|\/confirm|\/reject|proofUrl|PENDING|\/workspaces\/\$\{[^}]+\}\/payments/);
    }
    expect(pagesSource).not.toMatch(/features\/billing|features\/leasing|proofUrl|Xác nhận thanh toán|Từ chối/);
    expect(Object.keys(PAYMENT_ENTRY_KIND)).toEqual(['PAYMENT', 'REVERSAL']);
  });
  it('error codes map to Vietnamese', () => {
    const err = (code: string) => new ApiError({ statusCode: 409, code, message: 'raw' });
    expect(paymentErrorMessage(err('INVOICE_PAYMENT_EXCEEDS_DUE'))).toMatch(/vượt/);
    expect(paymentErrorMessage(err('INVOICE_PAYMENT_NOT_ELIGIBLE'))).toMatch(/đã phát hành/);
    expect(paymentErrorMessage(err('INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT'))).toMatch(/Mã chống gửi trùng/);
    expect(paymentErrorMessage(err('INVOICE_PAYMENT_INVALID'))).toMatch(/đảo/);
  });
});

describe('mock follows the backend payment rules', () => {
  const ws = db.tenants[0]!.workspaceId;
  const as = (role = 'OWNER') => {
    session.record = { user: { id: 'u1', fullName: 'Chủ', email: 'o@x.vn' }, memberships: [{ workspaceId: ws, role, status: 'ACTIVE', name: 'WS' }] };
  };
  const iso = (ms = Date.now()) => new Date(ms).toISOString();

  async function freeContract() {
    as();
    for (const c of (await tenancyMock.listContracts(ws)).filter((x) => x.phase === 'IN_EFFECT')) {
      const period = c.startDate.slice(0, 7);
      const existing = (await invoicesMock.listInvoices(ws, c.buildingId, { contractId: c.id, period }, { page: 1, limit: 5 })).items[0];
      if (!existing) return { c, period };
    }
    throw new Error('no free contract left for the test');
  }
  async function issuedInvoice() {
    const { c, period } = await freeContract();
    for (const meterType of ['ELECTRICITY', 'WATER'] as const) {
      await utilitiesMock.recordMeterReading(ws, c.buildingId, c.roomId, { meterType, period, previousReading: '1', currentReading: '11' }).catch(() => undefined);
    }
    const draft = await invoicesMock.createInvoice(ws, c.buildingId, { contractId: c.id, period });
    await invoicesMock.updateInvoice(ws, c.buildingId, draft.id, {});
    return { b: c.buildingId, invoice: await invoicesMock.issueInvoice(ws, c.buildingId, draft.id) };
  }

  it('DRAFT does not take payments; OWNER only', async () => {
    const { c, period } = await freeContract();
    const draft = await invoicesMock.createInvoice(ws, c.buildingId, { contractId: c.id, period });
    expect(draft.status).toBe('DRAFT');
    await expect(paymentsMock.recordPayment(ws, c.buildingId, draft.id, { amount: '1000', method: 'CASH', receivedAt: iso(), idempotencyKey: 'pay-draft-0001' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_NOT_ELIGIBLE' });
    for (const role of ['MANAGER', 'STAFF']) {
      as(role);
      await expect(paymentsMock.listPayments(ws, c.buildingId, draft.id, { page: 1, limit: 20 })).rejects.toBeInstanceOf(ApiError);
    }
  });

  it('partial then full payment: totals come from the ledger, status moves UNPAID → PARTIALLY_PAID → PAID, overpayment refused', async () => {
    const { b, invoice } = await issuedInvoice();
    const total = Number(invoice.totalAmount);
    expect(invoice.paymentStatus).toBe('UNPAID');
    const empty = await paymentsMock.listPayments(ws, b, invoice.id, { page: 1, limit: 20 });
    expect(empty).toMatchObject({ total: 0, paidTotal: '0', paymentStatus: 'UNPAID', amountDue: String(total) });
    const partial = await paymentsMock.recordPayment(ws, b, invoice.id, { amount: '100000', method: 'CASH', receivedAt: iso(), note: 'Đợt 1', idempotencyKey: 'pay-part-0001' });
    expect(partial).toMatchObject({ kind: 'PAYMENT', amount: '100000', note: 'Đợt 1' });
    let after = await invoicesMock.getInvoice(ws, b, invoice.id);
    expect(after).toMatchObject({ status: 'ISSUED', paymentStatus: 'PARTIALLY_PAID', paidTotal: '100000', outstanding: String(total - 100000) });
    await expect(paymentsMock.recordPayment(ws, b, invoice.id, { amount: String(total), method: 'CASH', receivedAt: iso(), idempotencyKey: 'pay-over-0001' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_EXCEEDS_DUE' });
    await paymentsMock.recordPayment(ws, b, invoice.id, { amount: String(total - 100000), method: 'BANK_TRANSFER', receivedAt: iso(), idempotencyKey: 'pay-full-0001' });
    after = await invoicesMock.getInvoice(ws, b, invoice.id);
    expect(after).toMatchObject({ paymentStatus: 'PAID', outstanding: '0' });
    expect(after.status).toBe('ISSUED'); // payment status never becomes the invoice status
    const page = await paymentsMock.listPayments(ws, b, invoice.id, { page: 1, limit: 1 });
    expect(page).toMatchObject({ total: 2, paymentStatus: 'PAID', outstanding: '0' });
    expect(page.items).toHaveLength(1);
    expect((await paymentsMock.listPayments(ws, b, invoice.id, { page: 2, limit: 1 })).items).toHaveLength(1);
    expect(await paymentsMock.getPayment(ws, b, invoice.id, partial.id)).toMatchObject({ id: partial.id });
    await expect(paymentsMock.getPayment(ws, b, invoice.id, 'missing')).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_NOT_FOUND' });
  });

  it('rejects a future received time; idempotent retry returns the original, other content conflicts', async () => {
    const { b, invoice } = await issuedInvoice();
    await expect(paymentsMock.recordPayment(ws, b, invoice.id, { amount: '1000', method: 'CASH', receivedAt: iso(Date.now() + 3_600_000), idempotencyKey: 'pay-future-01' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_INVALID' });
    const at = iso(Date.now() - 60_000);
    const first = await paymentsMock.recordPayment(ws, b, invoice.id, { amount: '2000', method: 'CASH', receivedAt: at, idempotencyKey: 'pay-retry-001' });
    const replay = await paymentsMock.recordPayment(ws, b, invoice.id, { amount: '2000', method: 'CASH', receivedAt: at, idempotencyKey: 'pay-retry-001' });
    expect(replay.id).toBe(first.id);
    expect((await paymentsMock.listPayments(ws, b, invoice.id, { page: 1, limit: 20 })).total).toBe(1);
    await expect(paymentsMock.recordPayment(ws, b, invoice.id, { amount: '3000', method: 'CASH', receivedAt: at, idempotencyKey: 'pay-retry-001' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT' });
  });

  it('reverse creates a REVERSAL entry, restores the totals, and cannot be repeated or applied to a reversal', async () => {
    const { b, invoice } = await issuedInvoice();
    const paid = await paymentsMock.recordPayment(ws, b, invoice.id, { amount: '50000', method: 'CASH', receivedAt: iso(Date.now() - 1000), idempotencyKey: 'pay-rev-00001' });
    const rev = await paymentsMock.reversePayment(ws, b, invoice.id, paid.id, { reason: 'Ghi nhầm', idempotencyKey: 'rev-0000-0001' });
    expect(rev).toMatchObject({ kind: 'REVERSAL', amount: '50000', reversesPaymentId: paid.id, note: 'Ghi nhầm' });
    const original = await paymentsMock.getPayment(ws, b, invoice.id, paid.id);
    expect(original).toMatchObject({ amount: '50000', reversedByPaymentId: rev.id }); // original untouched
    expect(await invoicesMock.getInvoice(ws, b, invoice.id)).toMatchObject({ paidTotal: '0', paymentStatus: 'UNPAID' });
    // identical retry replays; a second reversal / a reversal of the reversal are refused
    expect((await paymentsMock.reversePayment(ws, b, invoice.id, paid.id, { reason: 'Ghi nhầm', idempotencyKey: 'rev-0000-0001' })).id).toBe(rev.id);
    await expect(paymentsMock.reversePayment(ws, b, invoice.id, paid.id, { reason: 'Lần hai', idempotencyKey: 'rev-0000-0002' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_INVALID' });
    await expect(paymentsMock.reversePayment(ws, b, invoice.id, rev.id, { reason: 'Đảo bản đảo', idempotencyKey: 'rev-0000-0003' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_INVALID' });
    await expect(paymentsMock.reversePayment(ws, b, invoice.id, paid.id, { reason: 'Khác', idempotencyKey: 'rev-0000-0001' })).rejects.toMatchObject({ code: 'INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT' });
  });

  it('an adjustment cannot lower the amount due below money already received', async () => {
    const { b, invoice } = await issuedInvoice();
    const total = Number(invoice.totalAmount);
    await paymentsMock.recordPayment(ws, b, invoice.id, { amount: String(total), method: 'CASH', receivedAt: iso(Date.now() - 1000), idempotencyKey: 'pay-below-001' });
    await expect(invoicesMock.createAdjustment(ws, b, invoice.id, { amount: '-1000', reason: 'Giảm', idempotencyKey: 'adj-below-001' })).rejects.toMatchObject({ code: 'INVOICE_ADJUSTMENT_BELOW_PAID' });
  });
});
