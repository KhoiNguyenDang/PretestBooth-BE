import { z } from 'zod';

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token không được để trống'),
});
export type RefreshDto = z.infer<typeof RefreshSchema>;
