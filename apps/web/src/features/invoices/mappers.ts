import type { CreateInvoiceAdjustmentRequest, CreateInvoiceRequest, InvoiceResponse, UpdateInvoiceRequest } from '@rental/shared';
import { formatMoney } from '@/features/property-management/mappers';

/** Tiền có dấu của bút toán điều chỉnh: "-50000" → "−50.000 ₫", "+" khi thu thêm. */
export function formatSignedMoney(value: string): string {
  const negative = value.startsWith('-');
  const text = formatMoney(negative ? value.slice(1) : value);
  return text === '—' ? text : `${negative ? '−' : '+'}${text}`;
}

export type TriState = '' | 'true' | 'false';
export const triToBool = (v: TriState | undefined): boolean | undefined => (v === 'true' ? true : v === 'false' ? false : undefined);
export const boolToTri = (v: boolean | null | undefined): TriState => (v === true ? 'true' : v === false ? 'false' : '');

export interface InvoiceFormValues {
  occupantCount?: string;
  billVehicles?: TriState;
  dueDate?: string;
  notes?: string;
}

const count = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : Number(v));

/** Tạo nháp: chỉ gửi trường người dùng thật sự nhập; không tự điền mặc định thay họ. */
export function toCreateBody(input: { contractId: string; period: string } & InvoiceFormValues): CreateInvoiceRequest {
  const body: CreateInvoiceRequest = { contractId: input.contractId, period: input.period };
  const oc = count(input.occupantCount);
  if (oc !== undefined) body.occupantCount = oc;
  const bv = triToBool(input.billVehicles);
  if (bv !== undefined) body.billVehicles = bv;
  if (input.dueDate) body.dueDate = input.dueDate;
  const notes = input.notes?.trim();
  if (notes) body.notes = notes;
  return body;
}

/**
 * Sửa nháp: chỉ gửi trường khác với hóa đơn hiện tại (backend tính lại toàn bộ khi nhận PATCH).
 * Backend không cho xóa số người ở / hạn thanh toán / lựa chọn tính phí xe, nên ô để trống = không gửi.
 */
export function diffUpdate(current: InvoiceResponse, next: InvoiceFormValues): UpdateInvoiceRequest {
  const body: UpdateInvoiceRequest = {};
  const oc = count(next.occupantCount);
  if (oc !== undefined && oc !== current.occupantCount) body.occupantCount = oc;
  const bv = triToBool(next.billVehicles);
  if (bv !== undefined && bv !== current.billsVehicles) body.billVehicles = bv;
  if (next.dueDate && next.dueDate !== current.dueDate) body.dueDate = next.dueDate;
  const notes = next.notes?.trim() ?? '';
  if (notes !== (current.notes ?? '')) body.notes = notes;
  return body;
}

export function toAdjustmentBody(input: { amount: string; reason: string; idempotencyKey: string; referenceAdjustmentId?: string }): CreateInvoiceAdjustmentRequest {
  const body: CreateInvoiceAdjustmentRequest = { amount: input.amount.trim(), reason: input.reason.trim(), idempotencyKey: input.idempotencyKey };
  if (input.referenceAdjustmentId) body.referenceAdjustmentId = input.referenceAdjustmentId;
  return body;
}

/** Khóa chống gửi trùng: sinh một lần cho mỗi thao tác, giữ nguyên khi thử lại (khớp /^[A-Za-z0-9_.:-]{8,100}$/). */
export function newIdempotencyKey(): string {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `adj-${id}`;
}

/** Số tiền hiển thị của hóa đơn: tổng chốt khi đã phát hành, tạm tính khi còn nháp. */
export const invoiceAmount = (i: Pick<InvoiceResponse, 'status' | 'totalAmount' | 'provisionalAmount'>) =>
  i.status === 'ISSUED' ? i.totalAmount : i.provisionalAmount;

export const canIssue = (i: Pick<InvoiceResponse, 'status' | 'isComplete'>) => i.status === 'DRAFT' && i.isComplete;
export const isDraft = (i: Pick<InvoiceResponse, 'status'>) => i.status === 'DRAFT';
