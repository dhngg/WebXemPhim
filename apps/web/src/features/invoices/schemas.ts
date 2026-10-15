import { z } from 'zod';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^\d{4}-(?:0[1-9]|1[0-2])$/;
/** Khớp DTO backend: tiền có dấu, tối đa 10 chữ số nguyên và 4 chữ số lẻ. */
const SIGNED_MONEY = /^-?(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;
const KEY = /^[A-Za-z0-9_.:-]+$/;

const occupantCount = z
  .string()
  .trim()
  .refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 100), 'Số người ở là số nguyên từ 0 đến 100');
const dueDate = z.string().refine((v) => v === '' || DATE.test(v), 'Hạn thanh toán không hợp lệ');
const notes = z.string().trim().max(1000, 'Ghi chú tối đa 1000 ký tự');
const triState = z.enum(['', 'true', 'false']);

export const createInvoiceSchema = z.object({
  contractId: z.string().min(1, 'Chọn hợp đồng'),
  period: z.string().regex(PERIOD, 'Chọn kỳ tính tiền (tháng/năm)'),
  occupantCount,
  billVehicles: triState,
  dueDate,
  notes,
});
export type CreateInvoiceForm = z.input<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({ occupantCount, billVehicles: triState, dueDate, notes });
export type UpdateInvoiceForm = z.input<typeof updateInvoiceSchema>;

export const adjustmentSchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(SIGNED_MONEY, 'Số tiền có dấu (dương = thu thêm, âm = giảm), tối đa 10 chữ số nguyên và 4 chữ số lẻ')
    .refine((v) => !/^-?0+(?:\.0+)?$/.test(v), 'Số tiền không được bằng 0'),
  reason: z.string().trim().min(1, 'Nhập lý do điều chỉnh').max(500, 'Lý do tối đa 500 ký tự'),
  referenceAdjustmentId: z.string(),
  idempotencyKey: z.string().min(8).max(100).regex(KEY),
});
export type AdjustmentForm = z.input<typeof adjustmentSchema>;
