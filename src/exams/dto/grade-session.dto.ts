import { z } from 'zod';

const GradeItemSchema = z.object({
  examItemId: z.string().uuid('Exam item ID không hợp lệ'),
  score: z.number().min(0, 'Điểm phải >= 0'),
  isCorrect: z.boolean(),
});

export const GradeSessionSchema = z.object({
  items: z.array(GradeItemSchema).min(1, 'Phải có ít nhất 1 mục cần chấm điểm'),
});

export type GradeSessionDto = z.infer<typeof GradeSessionSchema>;
