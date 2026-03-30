import { z } from 'zod';

export const SubmitQuestionReviewSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum(['APPROVED', 'NEEDS_REVISION']),
  notes: z.string().trim().max(2000).optional(),
});

export type SubmitQuestionReviewDto = z.infer<typeof SubmitQuestionReviewSchema>;
