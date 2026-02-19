import { z } from 'zod';

export const UpdateProblemSchema = z.object({
  title: z.string().min(1, 'Tiêu đề không được để trống').max(200).optional(),
  slug: z
    .string()
    .min(1, 'Slug không được để trống')
    .max(200)
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa chữ thường, số và dấu gạch ngang')
    .optional(),
  description: z.string().min(1, 'Mô tả không được để trống').optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  starterCode: z.record(z.string(), z.string()).optional().nullable(),
  constraints: z.string().optional().nullable(),
  hints: z.array(z.string()).optional(),
  timeLimit: z.number().int().positive().optional(),
  memoryLimit: z.number().int().positive().optional(),
  functionName: z.string().min(1).optional(),
  inputTypes: z.array(z.string()).optional(),
  outputType: z.string().min(1).optional(),
  argNames: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
});

export type UpdateProblemDto = z.infer<typeof UpdateProblemSchema>;
