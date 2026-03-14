import { z } from 'zod';
import { Difficulty } from '@prisma/client';

export const CreatePracticeSessionSchema = z.object({
  duration: z.number().int().min(10).max(180).default(30), // minutes
  totalItems: z.number().int().min(1).max(100).default(20),
  difficulty: z.nativeEnum(Difficulty).optional(),
  
  // Optional filters
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  
  // Mixed mode vs specific type
  includeQuestions: z.boolean().default(true),
  includeProblems: z.boolean().default(false),
});

export type CreatePracticeSessionDto = z.output<typeof CreatePracticeSessionSchema>;

export const SubmitPracticeAnswerSchema = z.object({
  itemId: z.string().uuid(),
  
  // For MC
  selectedChoiceIds: z.array(z.string().uuid()).optional(),
  
  // For Short Answer
  textAnswer: z.string().optional(),
  
  // For Coding Problem
  sourceCode: z.string().optional(),
  language: z.string().optional(),
  version: z.string().optional(),
}).refine(
  data => data.selectedChoiceIds || data.textAnswer || data.sourceCode,
  'Phải cung cấp ít nhất một phương thức trả lời'
);

export type SubmitPracticeAnswerDto = z.output<typeof SubmitPracticeAnswerSchema>;
