import { z } from 'zod';

export const TestShortAnswerGradingSchema = z.object({
  question: z.string().trim().min(3, 'Nội dung câu hỏi tối thiểu 3 ký tự').max(5000),
  referenceAnswer: z.string().trim().min(1, 'Đáp án tham chiếu không được để trống').max(5000),
  studentAnswer: z.string().trim().min(1, 'Câu trả lời sinh viên không được để trống').max(5000),
  maxScore: z.coerce.number().positive('Điểm tối đa phải lớn hơn 0').max(100),
  explanation: z.string().trim().max(5000).optional(),
});

export type TestShortAnswerGradingDto = z.output<typeof TestShortAnswerGradingSchema>;
