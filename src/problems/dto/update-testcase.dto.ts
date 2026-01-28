import { z } from 'zod';

export const UpdateTestCaseSchema = z.object({
  input: z.string().optional(),
  expectedOutput: z.string().optional(),
  explanation: z.string().optional().nullable(),
  isHidden: z.boolean().optional(),
  isSample: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
});

export type UpdateTestCaseDto = z.infer<typeof UpdateTestCaseSchema>;
