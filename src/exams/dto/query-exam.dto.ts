import { z } from 'zod';

export const QueryExamSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(10),
    subjectId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
    search: z.string().optional(),
    minDuration: z.coerce.number().int().positive().optional(),
    maxDuration: z.coerce.number().int().positive().optional(),
    minQuestionCount: z.coerce.number().int().nonnegative().optional(),
    maxQuestionCount: z.coerce.number().int().nonnegative().optional(),
    isPublished: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
    sortBy: z.enum(['createdAt', 'title', 'duration']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .superRefine((data, ctx) => {
    if (
      data.minDuration !== undefined &&
      data.maxDuration !== undefined &&
      data.minDuration > data.maxDuration
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minDuration không được lớn hơn maxDuration',
        path: ['minDuration'],
      });
    }

    if (
      data.minQuestionCount !== undefined &&
      data.maxQuestionCount !== undefined &&
      data.minQuestionCount > data.maxQuestionCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minQuestionCount không được lớn hơn maxQuestionCount',
        path: ['minQuestionCount'],
      });
    }
  });

export type QueryExamDto = z.infer<typeof QueryExamSchema>;
