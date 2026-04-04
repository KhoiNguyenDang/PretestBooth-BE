import { z } from 'zod';

export const PretestAssignmentModeSchema = z.enum([
  'QUESTION_BANK_RANDOM',
  'OFFICIAL_EXAM_POOL',
]);

export const PretestQuestionBankRandomConfigSchema = z
  .object({
    titlePrefix: z.string().trim().max(120).optional().nullable(),
    questionCount: z.coerce.number().int().min(0).max(200),
    problemCount: z.coerce.number().int().min(0).max(100),
    duration: z.coerce.number().int().min(5).max(240),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
    subjectIds: z.array(z.string().uuid('Subject ID không hợp lệ')).default([]),
    topicId: z.string().uuid('Topic ID không hợp lệ').optional().nullable(),
    passThresholdAbsolute: z.coerce.number().positive('Ngưỡng điểm đạt phải lớn hơn 0'),
    shuffleQuestions: z.boolean().default(true),
    shuffleChoices: z.boolean().default(true),
  })
  .refine((data) => data.questionCount + data.problemCount > 0, {
    message: 'Cần ít nhất 1 câu hỏi hoặc 1 bài code cho pretest',
    path: ['questionCount'],
  });

export const PretestOfficialExamPoolConfigSchema = z.object({
  examIds: z
    .array(z.string().uuid('Exam ID không hợp lệ'))
    .min(1, 'Danh sách pool đề thi chính thức không được rỗng'),
});

export const UpsertPretestConfigSchema = z
  .object({
    isEnabled: z.boolean().default(true),
    assignmentMode: PretestAssignmentModeSchema,
    maxAttempts: z.coerce.number().int().min(1).max(20).default(3),
    lockAfterPass: z.boolean().default(true),
    questionBankRandom: PretestQuestionBankRandomConfigSchema.optional().nullable(),
    officialExamPool: PretestOfficialExamPoolConfigSchema.optional().nullable(),
  })
  .refine(
    (data) => {
      if (!data.isEnabled) {
        return true;
      }

      if (data.assignmentMode === 'QUESTION_BANK_RANDOM') {
        return Boolean(data.questionBankRandom);
      }
      return Boolean(data.officialExamPool);
    },
    {
      message: 'Thiếu cấu hình cho mode gán đề đã chọn',
      path: ['assignmentMode'],
    },
  );

export type PretestAssignmentMode = z.output<typeof PretestAssignmentModeSchema>;
export type PretestQuestionBankRandomConfig = z.output<
  typeof PretestQuestionBankRandomConfigSchema
>;
export type PretestOfficialExamPoolConfig = z.output<
  typeof PretestOfficialExamPoolConfigSchema
>;
export type UpsertPretestConfigDto = z.output<typeof UpsertPretestConfigSchema>;

export type PretestConfigDto = {
  isEnabled: boolean;
  assignmentMode: PretestAssignmentMode;
  maxAttempts: number;
  lockAfterPass: boolean;
  questionBankRandom: PretestQuestionBankRandomConfig | null;
  officialExamPool: PretestOfficialExamPoolConfig | null;
  updatedAt: Date | null;
  updatedByUserId: string | null;
};

export class PretestStatusDto {
  isEnabled!: boolean;
  assignmentMode!: PretestAssignmentMode;
  maxAttempts!: number;
  attemptsUsed!: number;
  remainingAttempts!: number;
  passed!: boolean;
  lockAfterPass!: boolean;

  constructor(partial: Partial<PretestStatusDto>) {
    Object.assign(this, partial);
  }
}
