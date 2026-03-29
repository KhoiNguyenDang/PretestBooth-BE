import { z } from 'zod';

export const UpdateCheckinThresholdSchema = z.object({
  threshold: z.number().min(0.5).max(0.99),
});

export type UpdateCheckinThresholdDto = z.output<typeof UpdateCheckinThresholdSchema>;
