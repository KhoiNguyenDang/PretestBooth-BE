import { z } from 'zod';

// Supported languages by Piston API
export const SupportedLanguages = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'ruby',
  'php',
  'swift',
  'kotlin',
] as const;

export type SupportedLanguage = (typeof SupportedLanguages)[number];

// Execute code DTO
export const ExecuteCodeSchema = z.object({
  language: z.string().min(1, 'Language is required'),
  version: z.string().default('*'),
  source: z.string().min(1, 'Source code is required'),
  stdin: z.string().optional().default(''),
  args: z.array(z.string()).optional().default([]),
  compileTimeout: z.number().int().positive().optional().default(10000),
  runTimeout: z.number().int().positive().optional().default(5000),
  compileMemoryLimit: z.number().int().positive().optional().default(-1),
  runMemoryLimit: z.number().int().positive().optional().default(-1),
});

// Output type (after validation with defaults applied)
export type ExecuteCodeDto = z.output<typeof ExecuteCodeSchema>;

// Input type (for internal calls with optional fields)
export type ExecuteCodeInput = z.input<typeof ExecuteCodeSchema>;

// Execute code against test cases DTO
export const ExecuteWithTestCasesSchema = z.object({
  language: z.string().min(1, 'Language is required'),
  version: z.string().default('*'),
  source: z.string().min(1, 'Source code is required'),
  problemId: z.string().uuid('Invalid problem ID'),
  runTimeout: z.number().int().positive().optional().default(5000),
});

export type ExecuteWithTestCasesDto = z.output<typeof ExecuteWithTestCasesSchema>;
export type ExecuteWithTestCasesInput = z.input<typeof ExecuteWithTestCasesSchema>;

// Run single test case DTO
export const RunTestCaseSchema = z.object({
  language: z.string().min(1, 'Language is required'),
  version: z.string().default('*'),
  source: z.string().min(1, 'Source code is required'),
  input: z.string(),
  expectedOutput: z.string(),
  runTimeout: z.number().int().positive().optional().default(5000),
});

export type RunTestCaseDto = z.output<typeof RunTestCaseSchema>;
