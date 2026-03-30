import { z } from 'zod';

export const ResubmitQuestionReviewSchema = z.object({
  sessionId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional(),
});

export type ResubmitQuestionReviewDto = z.infer<typeof ResubmitQuestionReviewSchema>;
