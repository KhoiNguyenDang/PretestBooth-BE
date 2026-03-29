import { z } from 'zod';

export const CheckinVerifySchema = z.object({
  bookingId: z.string().uuid('Booking ID không hợp lệ'),
  image: z.string().min(100, 'Ảnh khuôn mặt không hợp lệ'),
  verifierDeviceId: z.string().max(80).optional(),
});

export type CheckinVerifyDto = z.output<typeof CheckinVerifySchema>;
