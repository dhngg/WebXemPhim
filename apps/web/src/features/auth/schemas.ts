import { z } from 'zod';

/** SĐT Việt Nam: 10 số, bắt đầu bằng 0 (cho phép khoảng trắng khi nhập). */
export const vnPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s/g, ''))
  .pipe(z.string().regex(/^0\d{9}$/, 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0'));

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Vui lòng nhập email hoặc số điện thoại'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(80, 'Họ tên quá dài'),
    email: z.string().trim().toLowerCase().email('Email không hợp lệ'),
    phone: vnPhoneSchema,
    password: z
      .string()
      .min(8, 'Mật khẩu tối thiểu 8 ký tự')
      .regex(/[A-Za-z]/, 'Mật khẩu cần có chữ cái')
      .regex(/\d/, 'Mật khẩu cần có chữ số'),
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Bạn cần đồng ý điều khoản sử dụng' }) }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Mật khẩu xác nhận không khớp',
  });

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Họ tên tối thiểu 2 ký tự').max(80, 'Họ tên quá dài'),
  phone: vnPhoneSchema,
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ'),
});

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.input<typeof registerSchema>;
export type ProfileForm = z.input<typeof profileSchema>;
