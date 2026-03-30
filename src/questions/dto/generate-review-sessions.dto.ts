import { z } from 'zod';

export const GenerateReviewSessionsSchema = z.object({
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type GenerateReviewSessionsDto = z.infer<typeof GenerateReviewSessionsSchema>;
