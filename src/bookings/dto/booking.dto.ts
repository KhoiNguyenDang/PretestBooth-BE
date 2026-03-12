import { z } from 'zod';

export const CreateBookingSchema = z.object({
  boothId: z.string().uuid('ID booth không hợp lệ'),
  type: z.enum(['PRACTICE', 'EXAM']),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Ngày không hợp lệ'),
  startTime: z.string().refine((val) => !isNaN(Date.parse(val)), 'Thời gian bắt đầu không hợp lệ'),
  endTime: z.string().refine((val) => !isNaN(Date.parse(val)), 'Thời gian kết thúc không hợp lệ'),
});

export type CreateBookingDto = z.output<typeof CreateBookingSchema>;

export const QueryBookingSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  status: z.enum(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
  type: z.enum(['PRACTICE', 'EXAM']).optional(),
  date: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryBookingDto = z.output<typeof QueryBookingSchema>;

export const AvailabilityQuerySchema = z.object({
  date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Ngày không hợp lệ'),
});

export type AvailabilityQueryDto = z.output<typeof AvailabilityQuerySchema>;
