import { z } from 'zod';

export const CreateTestCaseInlineSchema = z.object({
  input: z.string().min(0, 'Input không được để trống'),
  expectedOutput: z.string().min(0, 'Expected output không được để trống'),
  explanation: z.string().optional().nullable(),
  isHidden: z.boolean().default(false),
  isSample: z.boolean().default(false),
  order: z.number().int().min(0).default(0),
});

export const CreateProblemSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(200),
  slug: z
    .string()
    .min(1, 'Slug không được để trống')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa chữ thường, số và dấu gạch ngang'),
  description: z.string().min(1, 'Mô tả không được để trống'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  starterCode: z.record(z.string(), z.string()).optional().nullable(),
  constraints: z.string().optional().nullable(),
  hints: z.array(z.string()).optional().default([]),
  timeLimit: z.number().int().positive().default(1000),
  memoryLimit: z.number().int().positive().default(256),
  isPublished: z.boolean().default(false),

  // Function signature metadata for driver code generation
  functionName: z.string().min(1).default('solution'),
  inputTypes: z.array(z.string()).optional().default([]),
  outputType: z.string().min(1).default('void'),
  argNames: z.array(z.string()).optional().default([]),

  // Optional inline test cases creation
  testCases: z.array(CreateTestCaseInlineSchema).optional(),
});

export type CreateProblemDto = z.infer<typeof CreateProblemSchema>;
