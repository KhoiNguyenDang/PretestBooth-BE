import { z } from 'zod';

export const ExtendExamSessionSchema = z.object({
  minutes: z.coerce.number().int().min(1).max(120),
  reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(300),
});

export type ExtendExamSessionDto = z.output<typeof ExtendExamSessionSchema>;

export const ForceSubmitExamSessionSchema = z.object({
  reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(300),
});

export type ForceSubmitExamSessionDto = z.output<typeof ForceSubmitExamSessionSchema>;

export const AbortExamSessionSchema = z.object({
  reason: z.string().trim().min(3, 'Lý do tối thiểu 3 ký tự').max(300),
});

export type AbortExamSessionDto = z.output<typeof AbortExamSessionSchema>;
