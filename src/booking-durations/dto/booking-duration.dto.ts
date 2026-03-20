import { z } from 'zod';

export const QueryBookingDurationSchema = z.object({
  type: z.enum(['PRACTICE', 'EXAM']).optional(),
  isActive: z
    .union([z.literal('true'), z.literal('false')])
    .transform((value) => value === 'true')
    .optional(),
});

export type QueryBookingDurationDto = z.output<typeof QueryBookingDurationSchema>;

export const CreateBookingDurationSchema = z.object({
  type: z.enum(['PRACTICE', 'EXAM']),
  durationMinutes: z
    .coerce
    .number()
    .int('Thời lượng phải là số nguyên')
    .min(5, 'Thời lượng tối thiểu 5 phút')
    .max(240, 'Thời lượng tối đa 240 phút'),
  isActive: z.boolean().optional().default(true),
  displayOrder: z
    .coerce
    .number()
    .int('Thứ tự hiển thị phải là số nguyên')
    .min(0, 'Thứ tự hiển thị phải >= 0')
    .optional(),
});

export type CreateBookingDurationDto = z.output<typeof CreateBookingDurationSchema>;

export const UpdateBookingDurationSchema = z.object({
  type: z.enum(['PRACTICE', 'EXAM']).optional(),
  durationMinutes: z
    .coerce
    .number()
    .int('Thời lượng phải là số nguyên')
    .min(5, 'Thời lượng tối thiểu 5 phút')
    .max(240, 'Thời lượng tối đa 240 phút')
    .optional(),
  isActive: z.boolean().optional(),
  displayOrder: z
    .union([
      z.coerce.number().int('Thứ tự hiển thị phải là số nguyên').min(0, 'Thứ tự hiển thị phải >= 0'),
      z.null(),
    ])
    .optional(),
});

export type UpdateBookingDurationDto = z.output<typeof UpdateBookingDurationSchema>;
