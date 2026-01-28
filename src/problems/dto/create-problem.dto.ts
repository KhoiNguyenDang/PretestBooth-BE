import { z } from 'zod';

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
});

export type CreateProblemDto = z.infer<typeof CreateProblemSchema>;
