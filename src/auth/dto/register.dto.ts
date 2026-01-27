import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z
    .string()
    .email('Email không hợp lệ')
    .regex(
      /^\d{8}\.[a-z]+@(student|teacher)\.iuh\.edu\.vn$/,
      'Vui lòng sử dụng email trường (XXXXXXXX.yourname@(student|teacher).iuh.edu.vn)',
    ),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
