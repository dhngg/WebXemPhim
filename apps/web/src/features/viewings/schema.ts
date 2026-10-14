import { z } from 'zod';
import { vnPhoneSchema } from '@/features/auth/schemas';

/** Khung giờ đề xuất (giờ địa phương Asia/Ho_Chi_Minh). */
export const VIEWING_SLOTS = ['08:30', '10:00', '14:00', '15:30', '17:00', '19:00'] as const;

/** Ghép ngày (yyyy-MM-dd) + giờ (HH:mm) theo múi giờ VN (UTC+7, không DST) thành ISO UTC. */
export function toVietnamIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

export function viewingSchema(now: Date = new Date()) {
  return z
    .object({
      date: z.string().min(1, 'Vui lòng chọn ngày xem phòng'),
      time: z.enum(VIEWING_SLOTS, { errorMap: () => ({ message: 'Vui lòng chọn khung giờ' }) }),
      contactName: z.string().trim().min(2, 'Vui lòng nhập họ tên'),
      contactPhone: vnPhoneSchema,
      note: z.string().max(300, 'Ghi chú tối đa 300 ký tự').optional(),
    })
    .refine((v) => new Date(toVietnamIso(v.date, v.time)).getTime() > now.getTime() + 60 * 60_000, {
      path: ['date'],
      message: 'Thời gian xem phải sau thời điểm hiện tại ít nhất 1 giờ',
    });
}

export type ViewingForm = z.input<ReturnType<typeof viewingSchema>>;
