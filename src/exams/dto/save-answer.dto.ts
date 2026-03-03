import { z } from 'zod';

export const SaveAnswerSchema = z.object({
  examItemId: z.string().uuid('Exam item ID không hợp lệ'),
  selectedChoiceIds: z.array(z.string().uuid()).optional().default([]),
  textAnswer: z.string().optional().nullable(),
  submissionId: z.string().uuid().optional().nullable(),
});

export type SaveAnswerDto = z.infer<typeof SaveAnswerSchema>;
