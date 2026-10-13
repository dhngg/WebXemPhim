import { z } from 'zod';
import { vnPhoneSchema } from '@/features/auth/schemas';

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const tenantSchema = z.object({
  fullName: z.string().trim().min(2, 'Vui lòng nhập họ tên'),
  phone: vnPhoneSchema,
  email: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, 'Email không hợp lệ')
    .transform((v) => (v ? v : undefined)),
  idNumber: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{9}(\d{3})?$/.test(v), 'CCCD/CMND gồm 9 hoặc 12 chữ số')
    .transform((v) => (v ? v : undefined)),
  dateOfBirth: optionalText,
  hometown: optionalText,
  note: optionalText,
});
export type TenantForm = z.input<typeof tenantSchema>;

export const contractSchema = z
  .object({
    roomId: z.string().min(1, 'Chọn phòng'),
    primaryTenantId: z.string().min(1, 'Chọn người đứng tên hợp đồng'),
    occupantIds: z.array(z.string()),
    startDate: z.string().min(1, 'Bắt buộc nhập ngày bắt đầu'),
    endDate: z.string().min(1, 'Bắt buộc nhập ngày kết thúc'),
    monthlyRent: z.number({ required_error: 'Nhập tiền thuê', invalid_type_error: 'Nhập tiền thuê' }).int().min(100_000, 'Tiền thuê tối thiểu 100.000 ₫'),
    deposit: z.number({ required_error: 'Nhập tiền cọc', invalid_type_error: 'Nhập tiền cọc' }).int().min(0, 'Tiền cọc không âm'),
    waterMode: z.enum(['PER_PERSON', 'METER']),
    note: optionalText,
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu (ngày kết thúc tính bao gồm)',
  });
export type ContractForm = z.input<typeof contractSchema>;

export const vehicleSchema = z.object({
  tenantId: z.string().min(1, 'Chọn người sở hữu'),
  type: z.enum(['MOTORBIKE', 'EBIKE', 'BICYCLE', 'CAR']),
  plate: z.string().trim().min(3, 'Nhập biển số'),
  brand: z.string().trim().min(1, 'Nhập hãng / dòng xe'),
  monthlyFee: z.number({ invalid_type_error: 'Nhập phí gửi xe' }).int().min(0, 'Phí không âm'),
});
export type VehicleForm = z.input<typeof vehicleSchema>;
