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

export const QueryActiveMonitoringSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  boothId: z.string().uuid('ID booth không hợp lệ').optional(),
  activityType: z.enum(['EXAM', 'PRACTICE', 'IDLE']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type QueryActiveMonitoringDto = z.output<typeof QueryActiveMonitoringSchema>;

export const ForceCheckoutSchema = z.object({
  reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(300),
});

export type ForceCheckoutDto = z.output<typeof ForceCheckoutSchema>;

export const MonitoringNotifySchema = z.object({
  message: z.string().trim().min(3, 'Nội dung tối thiểu 3 ký tự').max(500),
  level: z.enum(['info', 'success', 'warning', 'error']).optional(),
});

export type MonitoringNotifyDto = z.output<typeof MonitoringNotifySchema>;
