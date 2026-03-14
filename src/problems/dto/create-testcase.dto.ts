import { z } from 'zod';

export const CreateTestCaseSchema = z.object({
  input: z.string().min(0, 'Input không được để trống'),
  expectedOutput: z.string().min(0, 'Expected output không được để trống'),
  explanation: z.string().optional().nullable(),
  isHidden: z.boolean().default(false),
  isSample: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
});

export type CreateTestCaseDto = z.infer<typeof CreateTestCaseSchema>;

export const CreateBulkTestCasesSchema = z.object({
  testCases: z.array(CreateTestCaseSchema).min(1, 'Cần ít nhất 1 test case'),
});

export type CreateBulkTestCasesDto = z.infer<typeof CreateBulkTestCasesSchema>;
