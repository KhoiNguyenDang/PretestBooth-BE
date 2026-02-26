import { z } from 'zod';

export const CreateSubjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên môn học không được để trống')
    .max(200, 'Tên môn học không được quá 200 ký tự'),
  description: z.string().optional().nullable(),
});

export type CreateSubjectDto = z.infer<typeof CreateSubjectSchema>;

export const UpdateSubjectSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên môn học không được để trống')
    .max(200, 'Tên môn học không được quá 200 ký tự')
    .optional(),
  description: z.string().optional().nullable(),
});

export type UpdateSubjectDto = z.infer<typeof UpdateSubjectSchema>;
