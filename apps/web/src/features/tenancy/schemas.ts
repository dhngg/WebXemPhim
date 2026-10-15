import { z } from 'zod';
import { todayVN } from '@/lib/dates';
import { normalizePhone, normalizePlate } from './mappers';

const optionalText = (max: number, label: string) => z.string().trim().max(max, `${label} tối đa ${max} ký tự`);

/** Khớp DTO backend: họ tên 1–150; điện thoại 7–15 chữ số (có thể có +); email ≤254; địa chỉ ≤500; ghi chú ≤5000. */
export const tenantSchema = z.object({
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ tên').max(150, 'Họ tên tối đa 150 ký tự'),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^\+?[0-9]{7,15}$/.test(normalizePhone(v)), 'Số điện thoại gồm 7–15 chữ số'),
  email: z
    .string()
    .trim()
    .max(254, 'Email tối đa 254 ký tự')
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Email không hợp lệ'),
  dateOfBirth: z
    .string()
    .trim()
    .refine((v) => !v || v <= todayVN(), 'Ngày sinh không được ở tương lai'),
  address: optionalText(500, 'Địa chỉ'),
  notes: optionalText(5000, 'Ghi chú'),
});
export type TenantForm = z.input<typeof tenantSchema>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Khớp DTO backend: tiền thuê là số tiền VND không âm, tối đa 12 chữ số; ngày yyyy-MM-dd. */
export const contractSchema = z
  .object({
    roomId: z.string().min(1, 'Chọn phòng'),
    tenantId: z.string().min(1, 'Chọn người thuê'),
    startDate: z.string().regex(DATE, 'Bắt buộc nhập ngày bắt đầu'),
    endDate: z.string().regex(DATE, 'Bắt buộc nhập ngày kết thúc'),
    // Số nguyên VND (ô nhập tiền) hoặc chuỗi thập phân tối đa 2 chữ số để giữ nguyên hợp đồng có tiền lẻ.
    monthlyRent: z.union(
      [
        z.number().int().min(0).max(999_999_999_999),
        z.string().trim().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
      ],
      { errorMap: () => ({ message: 'Nhập tiền thuê hợp lệ (VND, không âm, tối đa 2 chữ số thập phân)' }) },
    ),
    notes: optionalText(5000, 'Ghi chú'),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu (ngày kết thúc tính bao gồm)',
  });
export type ContractForm = z.input<typeof contractSchema>;

export const vehicleSchema = z.object({
  tenantId: z.string().min(1, 'Chọn người sở hữu'),
  vehicleType: z.string().trim().min(1, 'Chọn loại xe').max(50, 'Loại xe tối đa 50 ký tự'),
  licensePlate: z
    .string()
    .trim()
    .refine((v) => /^[A-Z0-9]{5,15}$/.test(normalizePlate(v)), 'Biển số gồm 5–15 chữ và số (bỏ dấu cách, chấm, gạch nối)'),
  brand: optionalText(100, 'Hãng / dòng xe'),
  model: optionalText(100, 'Dòng xe'),
  color: optionalText(50, 'Màu sắc'),
  notes: optionalText(5000, 'Ghi chú'),
});
export type VehicleForm = z.input<typeof vehicleSchema>;
