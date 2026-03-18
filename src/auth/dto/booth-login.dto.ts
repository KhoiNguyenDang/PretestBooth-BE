import { z } from 'zod';

export const BoothLoginSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6),
  boothSessionToken: z.string().min(20, 'Booth session token không hợp lệ'),
});

export type BoothLoginDto = z.infer<typeof BoothLoginSchema>;
