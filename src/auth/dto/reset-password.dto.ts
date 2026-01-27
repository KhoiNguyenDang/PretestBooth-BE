import { z } from 'zod';

export const ResetPasswordSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  code: z
    .string()
    .regex(/^\d{6}$/, 'Mã đặt lại mật khẩu phải gồm 6 chữ số'),
  newPassword: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
