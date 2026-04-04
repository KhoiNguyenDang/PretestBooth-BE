import { z } from 'zod';

const ChoiceSchema = z.object({
  id: z.string().uuid().optional(), // existing choice ID for update
  content: z.string().min(1, 'Nội dung đáp án không được để trống'),
  isCorrect: z.boolean().default(false),
  order: z.number().int().min(0).optional(),
});

export const UpdateQuestionSchema = z
  .object({
    content: z.string().min(1, 'Nội dung câu hỏi không được để trống').optional(),
    imageUrl: z.string().max(2048, 'URL ảnh quá dài').optional().nullable(),
    questionType: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER']).optional(),
    classification: z.enum(['PRACTICE', 'EXAM']).optional(),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
    subjectId: z.string().uuid('Subject ID không hợp lệ').optional(),
    topicId: z.string().uuid('Topic ID không hợp lệ').optional().nullable(),
    explanation: z.string().optional().nullable(),
    isPublished: z.boolean().optional(),
    correctAnswer: z.string().optional().nullable(),
    choices: z.array(ChoiceSchema).optional(),
  })
  .superRefine((data, ctx) => {
    // If questionType is provided, validate choices/correctAnswer accordingly
    if (data.questionType === 'SHORT_ANSWER') {
      if (
        data.correctAnswer !== undefined &&
        (!data.correctAnswer || data.correctAnswer.trim().length === 0)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Câu hỏi tự luận ngắn phải có đáp án đúng',
          path: ['correctAnswer'],
        });
      }
    }

    if (
      (data.questionType === 'SINGLE_CHOICE' || data.questionType === 'MULTIPLE_CHOICE') &&
      data.choices
    ) {
      if (data.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Câu hỏi trắc nghiệm phải có ít nhất 2 đáp án',
          path: ['choices'],
        });
        return;
      }

      const correctCount = data.choices.filter((c) => c.isCorrect).length;

      if (data.questionType === 'SINGLE_CHOICE' && correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Câu hỏi một đáp án phải có đúng 1 đáp án đúng',
          path: ['choices'],
        });
      }

      if (data.questionType === 'MULTIPLE_CHOICE' && correctCount < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Câu hỏi nhiều đáp án phải có ít nhất 2 đáp án đúng',
          path: ['choices'],
        });
      }
    }
  });

export type UpdateQuestionDto = z.infer<typeof UpdateQuestionSchema>;
