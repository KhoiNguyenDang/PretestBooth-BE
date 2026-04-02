import { z } from 'zod';

export const QueryExamSessionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: z.enum(['IN_PROGRESS', 'SUBMITTED', 'GRADED']).optional(),
  examId: z.string().uuid('Exam ID không hợp lệ').optional(),
  studentId: z.string().uuid('Student ID không hợp lệ').optional(),
  sortBy: z.enum(['startedAt', 'score', 'finishedAt']).default('startedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryExamSessionsDto = z.infer<typeof QueryExamSessionsSchema>;
