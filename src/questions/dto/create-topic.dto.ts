import { z } from 'zod';

export const CreateTopicSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên chủ đề không được để trống')
    .max(200, 'Tên chủ đề không được quá 200 ký tự'),
});

export type CreateTopicDto = z.infer<typeof CreateTopicSchema>;

export const UpdateTopicSchema = z.object({
  name: z
    .string()
    .min(1, 'Tên chủ đề không được để trống')
    .max(200, 'Tên chủ đề không được quá 200 ký tự')
    .optional(),
});

export type UpdateTopicDto = z.infer<typeof UpdateTopicSchema>;
