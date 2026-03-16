import { z } from 'zod';

export const CreateBoothSchema = z.object({
  name: z.string().min(1, 'Tên booth không được để trống'),
  description: z.string().optional(),
  location: z.string().optional(),
});

export type CreateBoothDto = z.output<typeof CreateBoothSchema>;

export const UpdateBoothSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
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
