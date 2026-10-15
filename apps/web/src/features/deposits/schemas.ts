import { z } from 'zod';
import { DEPOSIT_RECORDABLE_KINDS, PAYMENT_METHODS, type CreateDepositEntryRequest, type DepositRecordableKind } from '@rental/shared';
import { localInputToIso, notInFuture } from '@/features/payments/schemas';

const WHOLE_VND = /^[1-9]\d{0,11}$/;

export const depositEntrySchema = z
  .object({
    kind: z.enum(DEPOSIT_RECORDABLE_KINDS, { errorMap: () => ({ message: 'Chọn loại giao dịch' }) }),
    amount: z.string().trim().regex(WHOLE_VND, 'Số tiền là số nguyên VND lớn hơn 0, tối đa 12 chữ số'),
    method: z.string(),
    occurredAt: z
      .string()
      .min(1, 'Chọn thời điểm xảy ra')
      .refine((v) => localInputToIso(v) !== null, 'Thời điểm không hợp lệ')
      .refine((v) => localInputToIso(v) === null || notInFuture(v), 'Thời điểm không được ở tương lai'),
    reason: z.string().trim().max(500, 'Lý do tối đa 500 ký tự'),
    reference: z.string().trim().max(200, 'Mã tham chiếu tối đa 200 ký tự'),
    note: z.string().trim().max(500, 'Ghi chú tối đa 500 ký tự'),
  })
  .superRefine((v, ctx) => {
    const need = (field: 'method' | 'reason' | 'reference', message: string) => {
      if (!v[field].trim()) ctx.addIssue({ code: 'custom', path: [field], message });
    };
    if (v.kind === 'COLLECTION' || v.kind === 'REFUND') {
      if (!(PAYMENT_METHODS as readonly string[]).includes(v.method)) ctx.addIssue({ code: 'custom', path: ['method'], message: 'Chọn hình thức' });
    }
    if (v.kind === 'DEDUCTION' || v.kind === 'REFUND') {
      need('reason', v.kind === 'DEDUCTION' ? 'Nhập lý do khấu trừ' : 'Nhập lý do hoàn cọc');
      need('reference', v.kind === 'DEDUCTION' ? 'Nhập nội dung khấu trừ liên quan (biên bản, hạng mục…)' : 'Nhập mã chuyển khoản hoặc số phiếu chi tiền mặt');
    }
  });
export type DepositEntryForm = z.input<typeof depositEntrySchema>;

/** Body theo từng loại: DEDUCTION không gửi method; reason/reference/note chỉ gửi khi có. */
export function toDepositBody(v: DepositEntryForm, idempotencyKey: string): CreateDepositEntryRequest {
  const kind = v.kind as DepositRecordableKind;
  const body: CreateDepositEntryRequest = {
    kind,
    amount: v.amount.trim(),
    occurredAt: localInputToIso(v.occurredAt) ?? v.occurredAt,
    idempotencyKey,
  };
  if (kind !== 'DEDUCTION') body.method = v.method as CreateDepositEntryRequest['method'];
  if (v.reason.trim()) body.reason = v.reason.trim();
  if (v.reference.trim()) body.reference = v.reference.trim();
  if (v.note.trim()) body.note = v.note.trim();
  return body;
}

export const reverseDepositSchema = z.object({ reason: z.string().trim().min(1, 'Nhập lý do đảo').max(500, 'Lý do tối đa 500 ký tự') });
export type ReverseDepositForm = z.input<typeof reverseDepositSchema>;
