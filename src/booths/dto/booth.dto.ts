import { z } from 'zod';

export const CreateBoothSchema = z.object({
  name: z.string().min(1, 'Tên booth không được để trống'),
  code: z.string().trim().min(3, 'Mã booth tối thiểu 3 ký tự').max(50, 'Mã booth tối đa 50 ký tự').optional(),
  description: z.string().optional(),
  location: z.string().optional(),
});

export type CreateBoothDto = z.output<typeof CreateBoothSchema>;

export const UpdateBoothSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.union([z.string().trim().min(3, 'Mã booth tối thiểu 3 ký tự').max(50, 'Mã booth tối đa 50 ký tự'), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  location: z.union([z.string(), z.null()]).optional(),
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).optional(),
  statusNote: z.string().trim().min(3, 'Ghi chú trạng thái tối thiểu 3 ký tự').max(300).optional(),
}).superRefine((data, ctx) => {
  if (data.status && !data.statusNote) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['statusNote'],
      message: 'Cần ghi chú xác nhận khi đổi trạng thái booth',
    });
  }
});

export type UpdateBoothDto = z.output<typeof UpdateBoothSchema>;

export const QueryBoothSchema = z.object({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

export type QueryBoothDto = z.output<typeof QueryBoothSchema>;

export const GenerateActivationOtpSchema = z.object({
  boothCode: z.string().trim().min(3, 'Mã booth tối thiểu 3 ký tự').max(50, 'Mã booth tối đa 50 ký tự'),
});

export type GenerateActivationOtpDto = z.output<typeof GenerateActivationOtpSchema>;

export const ActivateBoothSchema = z.object({
  boothCode: z.string().trim().min(3, 'Mã booth tối thiểu 3 ký tự').max(50, 'Mã booth tối đa 50 ký tự'),
  otp: z.string().trim().min(4, 'OTP tối thiểu 4 ký tự').max(10, 'OTP tối đa 10 ký tự'),
});

export type ActivateBoothDto = z.output<typeof ActivateBoothSchema>;

export const ForceBoothLogoutSchema = z.object({
  reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(300),
});

export type ForceBoothLogoutDto = z.output<typeof ForceBoothLogoutSchema>;
