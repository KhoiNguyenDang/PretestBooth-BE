import { z } from 'zod';

const ChoiceSchema = z.object({
  content: z.string().min(1, 'Nội dung đáp án không được để trống'),
  isCorrect: z.boolean().default(false),
  order: z.number().int().min(0).optional(),
});

export const CreateQuestionSchema = z
  .object({
    content: z.string().min(1, 'Nội dung câu hỏi không được để trống'),
    questionType: z.enum(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SHORT_ANSWER']),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
    subjectId: z.string().uuid('Subject ID không hợp lệ'),
    topicId: z.string().uuid('Topic ID không hợp lệ').optional().nullable(),
    explanation: z.string().optional().nullable(),
    isPublished: z.boolean().default(false),
    correctAnswer: z.string().optional().nullable(),
    choices: z.array(ChoiceSchema).optional(),
  })
  .superRefine((data, ctx) => {
    // SHORT_ANSWER requires correctAnswer
    if (data.questionType === 'SHORT_ANSWER') {
      if (!data.correctAnswer || data.correctAnswer.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Câu hỏi tự luận ngắn phải có đáp án đúng',
          path: ['correctAnswer'],
        });
      }
    }

    // SINGLE_CHOICE and MULTIPLE_CHOICE require choices
    if (data.questionType === 'SINGLE_CHOICE' || data.questionType === 'MULTIPLE_CHOICE') {
      if (!data.choices || data.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Câu hỏi trắc nghiệm phải có ít nhất 2 đáp án',
          path: ['choices'],
        });
        return;
      }

      const correctCount = data.choices.filter((c) => c.isCorrect).length;

      if (data.questionType === 'SINGLE_CHOICE') {
        if (correctCount !== 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Câu hỏi một đáp án phải có đúng 1 đáp án đúng',
            path: ['choices'],
          });
        }
      }

      if (data.questionType === 'MULTIPLE_CHOICE') {
        if (correctCount < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Câu hỏi nhiều đáp án phải có ít nhất 2 đáp án đúng',
            path: ['choices'],
          });
        }
      }
    }
  });

export type CreateQuestionDto = z.infer<typeof CreateQuestionSchema>;
