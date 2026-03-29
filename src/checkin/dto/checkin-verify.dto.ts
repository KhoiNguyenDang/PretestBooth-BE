import { z } from 'zod';

export const CheckinLivenessSchema = z.object({
  action: z.enum(['BLINK', 'SMILE']),
  passed: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
});

export const CheckinVerifySchema = z.object({
  bookingId: z.string().uuid('Booking ID không hợp lệ'),
  image: z.string().min(100, 'Ảnh khuôn mặt không hợp lệ'),
  liveness: CheckinLivenessSchema,
  threshold: z.number().min(0.5).max(0.99).optional(),
  verifierDeviceId: z.string().max(80).optional(),
});

export type CheckinVerifyDto = z.output<typeof CheckinVerifySchema>;
