import { z } from 'zod';

export const SaveAnswerSchema = z.object({
  examItemId: z.string().uuid('Exam item ID không hợp lệ'),
  selectedChoiceIds: z.array(z.string().uuid()).optional().default([]),
  textAnswer: z.string().optional().nullable(),
  submissionId: z.string().uuid().optional().nullable(),
  // For coding problems — store source code for deferred execution on submit
  sourceCode: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  languageVersion: z.string().optional().nullable(),
});

export type SaveAnswerDto = z.infer<typeof SaveAnswerSchema>;
