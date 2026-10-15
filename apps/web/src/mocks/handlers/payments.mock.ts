import type { InvoicePaymentPageResponse, InvoicePaymentResponse } from '@rental/shared';
import type { PaymentsApi } from '@/features/payments/api';
import { ApiError } from '@/services/http/ApiError';
import { db, nextId } from '../db';
import { requireMember } from '../guard';
import { simulate } from '../mockUtils';
import { findStoredInvoice, paidOf, paymentLedger, refreshTotals, type StoredInvoice } from './invoices.mock';

/**
 * Mock theo đúng quy tắc của backend (Payments): chỉ OWNER; chỉ hóa đơn ISSUED nhận thanh toán; số tiền nguyên VND;
 * không vượt số phải thu; thời điểm nhận không quá 5 phút trong tương lai; khóa chống gửi trùng (retry trả bản cũ,
 * khác nội dung → xung đột); đảo = bản ghi REVERSAL mới, không sửa/xóa bản gốc, không đảo hai lần hay đảo bản đảo.
 */
const FUTURE_TOLERANCE_MS = 5 * 60_000;
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError({ statusCode: status, code, message });
};

function scope(ws: string, buildingId: string, invoiceId: string) {
  const { user } = requireMember(ws, 'payments.confirm');
  if (!db.buildings.some((b) => b.workspaceId === ws && b.id === buildingId)) fail(404, 'INVOICE_PAYMENT_NOT_FOUND', 'Building not found');
  const invoice = (() => {
    try {
      return findStoredInvoice(ws, buildingId, invoiceId);
    } catch {
      return fail(404, 'INVOICE_PAYMENT_NOT_FOUND', 'Invoice not found');
    }
  })();
  return { user, invoice };
}

const strip = (p: InvoicePaymentResponse & { key: string }): InvoicePaymentResponse => {
  const { key, ...rest } = p;
  void key;
  const reversedBy = paymentLedger.find((x) => x.reversesPaymentId === p.id);
  return { ...rest, reversedByPaymentId: reversedBy?.id ?? null };
};

export const paymentsMock: PaymentsApi = {
  async listPayments(ws, buildingId, invoiceId, page) {
    await simulate();
    const { invoice } = scope(ws, buildingId, invoiceId);
    return paymentPage(invoice, page);
  },

  async recordPayment(ws, buildingId, invoiceId, input) {
    await simulate();
    const { user, invoice } = scope(ws, buildingId, invoiceId);
    const existing = paymentLedger.find((p) => p.invoiceId === invoiceId && p.key === input.idempotencyKey);
    if (existing) {
      const same = existing.kind === 'PAYMENT' && existing.amount === input.amount && existing.method === input.method && existing.receivedAt === new Date(input.receivedAt).toISOString() && (existing.note ?? '') === (input.note ?? '');
      if (!same) fail(409, 'INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT', 'Idempotency key reused');
      return strip(existing);
    }
    if (invoice.status !== 'ISSUED') fail(409, 'INVOICE_PAYMENT_NOT_ELIGIBLE', 'Only ISSUED invoices take payments');
    const received = new Date(input.receivedAt);
    if (Number.isNaN(received.getTime()) || received.getTime() > Date.now() + FUTURE_TOLERANCE_MS) fail(409, 'INVOICE_PAYMENT_INVALID', 'Received in the future');
    if (paidOf(invoiceId) + Number(input.amount) > Number(invoice.adjustedTotal)) fail(409, 'INVOICE_PAYMENT_EXCEEDS_DUE', 'Exceeds amount due');
    const entry = {
      id: nextId('pay'), workspaceId: ws, invoiceId, kind: 'PAYMENT' as const, amount: input.amount, method: input.method, receivedAt: received.toISOString(),
      note: input.note ?? null, reversesPaymentId: null, reversedByPaymentId: null, confirmedBy: user.id, createdAt: new Date().toISOString(), key: input.idempotencyKey,
    };
    paymentLedger.push(entry);
    refreshTotals(invoice);
    return strip(entry);
  },

  async getPayment(ws, buildingId, invoiceId, paymentId) {
    await simulate();
    scope(ws, buildingId, invoiceId);
    const p = paymentLedger.find((x) => x.id === paymentId && x.invoiceId === invoiceId) ?? fail(404, 'INVOICE_PAYMENT_NOT_FOUND', 'Payment not found');
    return strip(p);
  },

  async reversePayment(ws, buildingId, invoiceId, paymentId, input) {
    await simulate();
    const { user, invoice } = scope(ws, buildingId, invoiceId);
    const existing = paymentLedger.find((p) => p.invoiceId === invoiceId && p.key === input.idempotencyKey);
    if (existing) {
      if (!(existing.kind === 'REVERSAL' && existing.reversesPaymentId === paymentId && existing.note === input.reason.trim())) fail(409, 'INVOICE_PAYMENT_IDEMPOTENCY_CONFLICT', 'Idempotency key reused');
      return strip(existing);
    }
    const original = paymentLedger.find((p) => p.id === paymentId && p.invoiceId === invoiceId) ?? fail(404, 'INVOICE_PAYMENT_NOT_FOUND', 'Payment not found');
    if (original.kind !== 'PAYMENT' || paymentLedger.some((p) => p.reversesPaymentId === original.id)) fail(409, 'INVOICE_PAYMENT_INVALID', 'Not reversible');
    const entry = {
      id: nextId('pay'), workspaceId: ws, invoiceId, kind: 'REVERSAL' as const, amount: original.amount, method: original.method, receivedAt: new Date().toISOString(),
      note: input.reason.trim(), reversesPaymentId: original.id, reversedByPaymentId: null, confirmedBy: user.id, createdAt: new Date().toISOString(), key: input.idempotencyKey,
    };
    paymentLedger.push(entry);
    refreshTotals(invoice);
    return strip(entry);
  },
};

/** Một trang sổ thanh toán kèm số liệu của cả hóa đơn (không tính từ riêng trang); dùng chung cho chủ trọ và người thuê. */
export function paymentPage(invoice: StoredInvoice, page: { page: number; limit: number }): InvoicePaymentPageResponse {
  const all = paymentLedger.filter((p) => p.invoiceId === invoice.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const due = invoice.status === 'ISSUED' ? Number(invoice.adjustedTotal) : 0;
  const paid = paidOf(invoice.id);
  return {
    items: all.slice((page.page - 1) * page.limit, page.page * page.limit).map(strip),
    page: page.page,
    limit: page.limit,
    total: all.length,
    amountDue: String(due),
    paidTotal: String(paid),
    outstanding: String(Math.max(0, due - paid)),
    paymentStatus: paid >= due ? 'PAID' : paid === 0 ? 'UNPAID' : 'PARTIALLY_PAID',
  };
}
