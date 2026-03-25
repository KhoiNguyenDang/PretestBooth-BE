import { z } from 'zod';

export const CreateExamSchema = z
  .object({
    title: z.string().min(1, 'Tiêu đề đề thi không được để trống'),
    description: z.string().optional().nullable(),
    subjectId: z.string().uuid('Subject ID không hợp lệ').optional().nullable(),
    subjectIds: z.array(z.string().uuid('Subject ID không hợp lệ')).optional(),
    topicId: z.string().uuid('Topic ID không hợp lệ').optional().nullable(),
    questionCount: z.number().int().min(0, 'Số câu hỏi phải >= 0').default(0),
    problemCount: z.number().int().min(0, 'Số bài code phải >= 0').default(0),
    includeProblemsRelatedToQuestions: z.boolean().default(false),
    difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
    duration: z.number().int().min(1, 'Thời gian làm bài phải >= 1 phút'),
    generationMode: z.enum(['RANDOM', 'MANUAL']).default('RANDOM'),
    allocationPolicy: z.enum(['STRICT', 'FLEXIBLE']).default('STRICT'),
    questionDifficultyDistribution: z
      .object({
        easy: z.number().int().min(0).default(0),
        medium: z.number().int().min(0).default(0),
        hard: z.number().int().min(0).default(0),
      })
      .optional(),
    questionAllocationRules: z
      .array(
        z.object({
          subjectId: z.string().uuid('Subject ID không hợp lệ'),
          difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional().nullable(),
          count: z.number().int().min(1, 'Số lượng phải >= 1'),
        }),
      )
      .optional(),
    problemDifficultyDistribution: z
      .object({
        easy: z.number().int().min(0).default(0),
        medium: z.number().int().min(0).default(0),
        hard: z.number().int().min(0).default(0),
      })
      .optional(),
    // Manual question/problem selection (lecturer/admin)
    questionIds: z.array(z.string().uuid('Question ID không hợp lệ')).optional(),
    problemIds: z.array(z.string().uuid('Problem ID không hợp lệ')).optional(),
    // Shuffle settings
    shuffleQuestions: z.boolean().default(true),
    shuffleChoices: z.boolean().default(true),
    // Publication settings
    visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE'),
    publishAt: z.coerce.date().optional().nullable(),
    publishNow: z.boolean().default(false),
  })
  .refine(
    (data) => !(data.publishNow && data.publishAt),
    {
      message: 'Không thể truyền đồng thời publishNow và publishAt',
      path: ['publishNow'],
    },
  )
  .refine(
    (data) => {
      if (!data.subjectIds?.length) return true;
      const unique = new Set(data.subjectIds);
      return unique.size === data.subjectIds.length;
    },
    {
      message: 'subjectIds không được trùng nhau',
      path: ['subjectIds'],
    },
  )
  .refine(
    (data) => {
      if (!data.subjectIds?.length || !data.subjectId) {
        return true;
      }

      return data.subjectIds.includes(data.subjectId);
    },
    {
      message: 'Nếu truyền cả subjectId và subjectIds thì subjectId phải thuộc subjectIds',
      path: ['subjectId'],
    },
  )
  .refine(
    (data) => {
      const isManual = data.generationMode === 'MANUAL';
      const qCount = isManual ? (data.questionIds?.length || 0) : data.questionCount;
      const pCount = isManual ? (data.problemIds?.length || 0) : data.problemCount;
      return qCount + pCount > 0;
    },
    {
      message: 'Đề thi phải có ít nhất 1 câu hỏi hoặc 1 bài code',
      path: ['questionCount'],
    },
  )
  .refine(
    (data) => {
      if (data.generationMode !== 'MANUAL') {
        return true;
      }

      // Manual mode must not use random-distribution config.
      return (
        !data.questionDifficultyDistribution &&
        !data.problemDifficultyDistribution &&
        !data.questionAllocationRules?.length
      );
    },
    {
      message: 'MANUAL mode không hỗ trợ difficultyDistribution',
      path: ['questionDifficultyDistribution'],
    },
  )
  .refine(
    (data) => {
      if (data.generationMode !== 'RANDOM') {
        return true;
      }

      // Random mode should not accept explicit item IDs.
      return !data.questionIds?.length && !data.problemIds?.length;
    },
    {
      message: 'RANDOM mode không nhận questionIds/problemIds',
      path: ['questionIds'],
    },
  )
  .refine(
    (data) => {
      if (data.generationMode !== 'RANDOM' || !data.questionDifficultyDistribution) {
        return true;
      }

      if (data.questionAllocationRules?.length) {
        return true;
      }

      const sum =
        data.questionDifficultyDistribution.easy +
        data.questionDifficultyDistribution.medium +
        data.questionDifficultyDistribution.hard;

      return sum === data.questionCount;
    },
    {
      message: 'Tổng phân bố độ khó phải bằng questionCount',
      path: ['questionDifficultyDistribution'],
    },
  )
  .refine(
    (data) => {
      if (data.generationMode !== 'RANDOM' || !data.questionAllocationRules?.length) {
        return true;
      }

      const sum = data.questionAllocationRules.reduce((acc, r) => acc + r.count, 0);
      return sum === data.questionCount;
    },
    {
      message: 'Tổng count trong questionAllocationRules phải bằng questionCount',
      path: ['questionAllocationRules'],
    },
  )
  .refine(
    (data) => {
      if (!data.questionAllocationRules?.length) return true;
      const pairs = data.questionAllocationRules.map(
        (r) => `${r.subjectId}::${r.difficulty || 'ANY'}`,
      );
      const uniquePairs = new Set(pairs);
      return uniquePairs.size === data.questionAllocationRules.length;
    },
    {
      message: 'questionAllocationRules không được trùng cặp subjectId + difficulty',
      path: ['questionAllocationRules'],
    },
  )
  .refine(
    (data) => {
      if (data.generationMode !== 'RANDOM' || !data.problemDifficultyDistribution) {
        return true;
      }

      const sum =
        data.problemDifficultyDistribution.easy +
        data.problemDifficultyDistribution.medium +
        data.problemDifficultyDistribution.hard;

      return sum === data.problemCount;
    },
    {
      message: 'Tổng phân bố độ khó phải bằng problemCount',
      path: ['problemDifficultyDistribution'],
    },
  );

export type CreateExamDto = z.infer<typeof CreateExamSchema>;
