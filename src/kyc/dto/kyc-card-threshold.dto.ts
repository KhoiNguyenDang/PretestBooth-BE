import { z } from 'zod';

export const UpdateKycCardThresholdSchema = z.object({
  threshold: z
    .number()
    .min(0.5, 'Ngưỡng xác thực thẻ phải >= 0.5')
    .max(0.99, 'Ngưỡng xác thực thẻ phải <= 0.99'),
});

export type UpdateKycCardThresholdDto = z.output<typeof UpdateKycCardThresholdSchema>;
