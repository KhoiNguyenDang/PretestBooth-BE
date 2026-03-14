import { z } from 'zod';

export const ResendVerificationSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
});

export type ResendVerificationDto = z.infer<typeof ResendVerificationSchema>;
