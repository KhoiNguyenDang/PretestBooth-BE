import { z } from 'zod';

export const QuerySubmissionTestGroupsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['PROBLEM', 'EXAM', 'ALL']).default('ALL'),
  keyword: z.string().trim().default(''),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QuerySubmissionTestGroupsDto = z.output<typeof QuerySubmissionTestGroupsSchema>;

export const QuerySubmissionTestMembersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QuerySubmissionTestMembersDto = z.output<typeof QuerySubmissionTestMembersSchema>;
