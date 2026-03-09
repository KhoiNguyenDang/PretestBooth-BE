import { z } from 'zod';

export const QueryUnifiedSubmissionsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['PROBLEM', 'EXAM', 'ALL']).default('ALL'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryUnifiedSubmissionsDto = z.output<typeof QueryUnifiedSubmissionsSchema>;
