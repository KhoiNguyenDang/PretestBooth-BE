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
});

export type UpdateBoothDto = z.output<typeof UpdateBoothSchema>;

export const QueryBoothSchema = z.object({
  status: z.enum(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).optional(),
});

export type QueryBoothDto = z.output<typeof QueryBoothSchema>;
