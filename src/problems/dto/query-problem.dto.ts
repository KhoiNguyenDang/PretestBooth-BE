import { z } from 'zod';

export const QueryProblemSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  search: z.string().optional(),
  isPublished: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['createdAt', 'title', 'difficulty', 'acceptanceRate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryProblemDto = z.infer<typeof QueryProblemSchema>;
