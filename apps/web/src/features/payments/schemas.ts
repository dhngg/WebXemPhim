import { z } from 'zod';
import { PAYMENT_METHODS, type CreateInvoicePaymentRequest } from '@rental/shared';

/** Backend cho lệch giờ tương lai tối đa 5 phút (đồng hồ máy). */
export const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** Số tiền nguyên VND > 0, tối đa 12 chữ số (khớp DTO). */
const WHOLE_VND = /^[1-9]\d{0,11}$/;

/** `datetime-local` (giờ máy) → ISO 8601; chuỗi rỗng/không hợp lệ → null. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** ISO → giá trị cho `datetime-local` theo giờ máy (yyyy-MM-ddTHH:mm). */
export function isoToLocalInput(iso: Date | string = new Date()): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const notInFuture = (value: string, now = Date.now()) => {
  const iso = localInputToIso(value);
  return iso !== null && new Date(iso).getTime() <= now + FUTURE_TOLERANCE_MS;
};

export const paymentSchema = z.object({
  amount: z.string().trim().regex(WHOLE_VND, 'Số tiền là số nguyên VND lớn hơn 0, tối đa 12 chữ số'),
  method: z.enum(PAYMENT_METHODS, { errorMap: () => ({ message: 'Chọn hình thức thanh toán' }) }),
  receivedAt: z
    .string()
    .min(1, 'Chọn thời điểm nhận tiền')
    .refine((v) => localInputToIso(v) !== null, 'Thời điểm không hợp lệ')
    .refine((v) => localInputToIso(v) === null || notInFuture(v), 'Thời điểm nhận tiền không được ở tương lai'),
  note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
});
export type PaymentForm = z.input<typeof paymentSchema>;

export const reverseSchema = z.object({ reason: z.string().trim().min(1, 'Nhập lý do đảo').max(500, 'Lý do tối đa 500 ký tự') });
export type ReverseForm = z.input<typeof reverseSchema>;

export function toPaymentBody(v: PaymentForm, idempotencyKey: string): CreateInvoicePaymentRequest {
  const body: CreateInvoicePaymentRequest = {
    amount: v.amount.trim(),
    method: v.method,
    receivedAt: localInputToIso(v.receivedAt) ?? v.receivedAt,
    idempotencyKey,
  };
  const note = v.note.trim();
  if (note) body.note = note;
  return body;
}
