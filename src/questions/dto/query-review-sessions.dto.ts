import { z } from 'zod';

export const QueryReviewSessionsSchema = z.object({
  quarter: z.coerce.number().int().min(1).max(4).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  status: z.enum(['PENDING', 'RESUBMITTED', 'APPROVED', 'NEEDS_REVISION', 'SKIPPED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type QueryReviewSessionsDto = z.infer<typeof QueryReviewSessionsSchema>;
