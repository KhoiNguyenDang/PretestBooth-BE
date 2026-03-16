import { z } from 'zod';

export const CreateExamSchema = z
  .object({
    title: z.string().min(1, 'Tiêu đề đề thi không được để trống'),
    description: z.string().optional().nullable(),
    subjectId: z.string().uuid('Subject ID không hợp lệ').optional().nullable(),
    topicId: z.string().uuid('Topic ID không hợp lệ').optional().nullable(),
    questionCount: z.number().int().min(0, 'Số câu hỏi phải >= 0').default(0),
    problemCount: z.number().int().min(0, 'Số bài code phải >= 0').default(0),
    includeProblemsRelatedToQuestions: z.boolean().default(false),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
    duration: z.number().int().min(1, 'Thời gian làm bài phải >= 1 phút'),
    // Manual question/problem selection (lecturer/admin)
    questionIds: z.array(z.string().uuid('Question ID không hợp lệ')).optional(),
    problemIds: z.array(z.string().uuid('Problem ID không hợp lệ')).optional(),
    // Shuffle settings
    shuffleQuestions: z.boolean().default(true),
    shuffleChoices: z.boolean().default(true),
  })
  .refine(
    (data) => {
      const qCount = data.questionIds?.length ?? data.questionCount;
      const pCount = data.problemIds?.length ?? data.problemCount;
      return qCount + pCount > 0;
    },
    {
      message: 'Đề thi phải có ít nhất 1 câu hỏi hoặc 1 bài code',
      path: ['questionCount'],
    },
  );

export type CreateExamDto = z.infer<typeof CreateExamSchema>;
