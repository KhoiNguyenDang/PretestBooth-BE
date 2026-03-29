import { z } from 'zod';

export const UpdateExamSchema = z
  .object({
    title: z.string().min(1, 'Tiêu đề đề thi không được để trống').optional(),
    description: z.string().optional().nullable(),
    duration: z.number().int().min(1, 'Thời gian làm bài phải >= 1 phút').optional(),
    isPublished: z.boolean().optional(),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).optional(),
    publishAt: z.coerce.date().optional().nullable(),
    publishNow: z.boolean().optional(),
    shuffleQuestions: z.boolean().optional(),
    shuffleChoices: z.boolean().optional(),
    type: z.enum(['PRACTICE', 'EXAM']).optional(),
  })
  .refine(
    (data) => !(data.publishNow && data.publishAt),
    {
      message: 'Không thể truyền đồng thời publishNow và publishAt',
      path: ['publishNow'],
    },
  );

export type UpdateExamDto = z.infer<typeof UpdateExamSchema>;
