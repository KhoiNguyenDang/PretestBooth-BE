import { z } from 'zod';

export const QueryQuestionSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  questionType: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER']).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  search: z.string().optional(),
  isPublished: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['createdAt', 'difficulty', 'questionType']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryQuestionDto = z.infer<typeof QueryQuestionSchema>;
