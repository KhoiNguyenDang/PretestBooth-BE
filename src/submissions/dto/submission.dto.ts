import { z } from 'zod';

// Create submission DTO (for submitting code)
export const CreateSubmissionSchema = z.object({
  language: z.string().min(1, 'Language is required'),
  version: z.string().default('*'),
  sourceCode: z.string().min(1, 'Source code is required'),
  problemId: z.string().uuid('Invalid problem ID'),
});

export type CreateSubmissionDto = z.output<typeof CreateSubmissionSchema>;

// Query submissions DTO
export const QuerySubmissionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  problemId: z.string().uuid().optional(),
  status: z
    .enum([
      'PENDING',
      'ACCEPTED',
      'WRONG_ANSWER',
      'COMPILE_ERROR',
      'RUNTIME_ERROR',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
    ])
    .optional(),
  language: z.string().optional(),
  sortBy: z.enum(['createdAt', 'executionTime', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QuerySubmissionsDto = z.output<typeof QuerySubmissionsSchema>;
