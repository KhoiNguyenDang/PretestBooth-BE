import { z } from 'zod';

export const BoothLogoutSchema = z.object({
  boothSessionToken: z.string().min(20, 'Booth session token không hợp lệ'),
});

export type BoothLogoutDto = z.infer<typeof BoothLogoutSchema>;
