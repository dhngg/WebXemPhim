import { z } from 'zod';
import { RATE_BILLING_UNITS, RATE_SERVICE_TYPES } from '@rental/shared';
import { compareDecimal, normalizeRateCode } from './mappers';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Khớp DTO backend: tiền tối đa 10 chữ số nguyên + 4 chữ số lẻ; chỉ số tối đa 11 + 3. */
const MONEY = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/;
const READING = /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;

const date = (message: string) => z.string().regex(DATE, message);
const price = z.string().trim().regex(MONEY, 'Đơn giá không âm, tối đa 10 chữ số nguyên và 4 chữ số lẻ');

export const rateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Nhập mã dịch vụ')
    .refine((v) => /^[A-Z][A-Z0-9_]{0,49}$/.test(normalizeRateCode(v)), 'Mã bắt đầu bằng chữ, chỉ gồm chữ/số/gạch dưới, tối đa 50 ký tự'),
  name: z.string().trim().min(1, 'Nhập tên dịch vụ').max(100, 'Tên tối đa 100 ký tự'),
  serviceType: z.enum(RATE_SERVICE_TYPES, { errorMap: () => ({ message: 'Chọn loại dịch vụ' }) }),
  billingUnit: z.enum(RATE_BILLING_UNITS, { errorMap: () => ({ message: 'Chọn đơn vị tính' }) }),
  unitPrice: price,
  effectiveFrom: date('Chọn ngày bắt đầu áp dụng'),
});
export type RateForm = z.input<typeof rateSchema>;

/** Đổi giá: ngày áp dụng mới phải SAU ngày áp dụng của phiên bản hiện tại (quy tắc backend). */
export const rateChangeSchema = (currentFrom: string) =>
  z.object({
    name: z.string().trim().min(1, 'Nhập tên dịch vụ').max(100, 'Tên tối đa 100 ký tự'),
    serviceType: z.enum(RATE_SERVICE_TYPES),
    billingUnit: z.enum(RATE_BILLING_UNITS),
    unitPrice: price,
    effectiveFrom: date('Chọn ngày áp dụng mới').refine((v) => v > currentFrom, 'Ngày áp dụng mới phải sau ngày áp dụng hiện tại'),
  });
export type RateChangeForm = z.input<ReturnType<typeof rateChangeSchema>>;

/** Ngày ngừng là ngày KẾT THÚC LOẠI TRỪ và phải sau ngày bắt đầu. */
export const stopSchema = (effectiveFrom: string) =>
  z.object({ effectiveTo: date('Chọn ngày ngừng áp dụng').refine((v) => v > effectiveFrom, 'Ngày ngừng phải sau ngày bắt đầu áp dụng') });
export type StopForm = z.input<ReturnType<typeof stopSchema>>;

export const roomServiceSchema = z.object({
  rateCode: z.string().min(1, 'Chọn dịch vụ'),
  effectiveFrom: date('Chọn ngày bắt đầu áp dụng'),
});
export type RoomServiceForm = z.input<typeof roomServiceSchema>;

const reading = (label: string) => z.string().trim().regex(READING, `${label}: số không âm, tối đa 11 chữ số nguyên và 3 chữ số lẻ`);

/** `needsPrevious`: lần ghi đầu của phòng/loại đồng hồ. Ngược lại số cũ do backend lấy từ kỳ trước (previous chỉ để so sánh). */
export const meterSchema = (needsPrevious: boolean, previous?: string) =>
  z
    .object({
      previousReading: needsPrevious ? reading('Số cũ') : z.string().optional(),
      currentReading: reading('Số mới'),
    })
    .superRefine((v, ctx) => {
      const prev = needsPrevious ? v.previousReading : previous;
      if (prev && /^\d/.test(prev) && /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/.test(v.currentReading) && compareDecimal(v.currentReading, prev) < 0) {
        ctx.addIssue({ code: 'custom', path: ['currentReading'], message: 'Số mới không được nhỏ hơn số cũ' });
      }
    });
export type MeterForm = z.input<ReturnType<typeof meterSchema>>;

export const adjustSchema = (allowPrevious: boolean, currentPrevious: string, currentReading: string) =>
  z
    .object({
      currentReading: reading('Số mới'),
      previousReading: allowPrevious ? reading('Số cũ') : z.string().optional(),
      reason: z.string().trim().min(1, 'Nhập lý do điều chỉnh').max(500, 'Lý do tối đa 500 ký tự'),
    })
    .superRefine((v, ctx) => {
      const prev = allowPrevious && v.previousReading ? v.previousReading : currentPrevious;
      if (!READING.test(v.currentReading) || !READING.test(prev)) return; // lỗi định dạng đã báo ở từng trường
      if (compareDecimal(v.currentReading, prev) < 0) ctx.addIssue({ code: 'custom', path: ['currentReading'], message: 'Số mới không được nhỏ hơn số cũ' });
      if (compareDecimal(prev, currentPrevious) === 0 && compareDecimal(v.currentReading, currentReading) === 0)
        ctx.addIssue({ code: 'custom', path: ['currentReading'], message: 'Chưa có thay đổi nào so với chỉ số hiện tại' });
    });
export type AdjustForm = z.input<ReturnType<typeof adjustSchema>>;
