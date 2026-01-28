// Piston API response types
export interface PistonRunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  output: string;
}

export interface PistonResponse {
  language: string;
  version: string;
  run: PistonRunResult;
  compile?: PistonRunResult;
}

// Single execution response
export class ExecutionResultDto {
  language: string;
  version: string;
  stdout: string;
  stderr: string;
  output: string;
  exitCode: number | null;
  signal: string | null;
  isSuccess: boolean;
  isCompileError: boolean;
  compileOutput?: string;
  executionTime: number; // ms - actual execution time from Piston
  networkTime: number; // ms - network latency
  totalTime: number; // ms - Tnetwork + Texecution

  constructor(partial: Partial<ExecutionResultDto>) {
    Object.assign(this, partial);
  }
}

// Test case execution result
export class TestCaseResultDto {
  testCaseId: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  stdout: string;
  stderr: string;
  isCorrect: boolean;
  isHidden: boolean;
  isSample: boolean;
  order: number;
  executionTime: number;
  passed: boolean;
  message?: string;

  constructor(partial: Partial<TestCaseResultDto>) {
    Object.assign(this, partial);
  }
}

// Full submission result with all test cases
export class SubmissionResultDto {
  language: string;
  version: string;
  problemId: string;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  isAllPassed: boolean;
  isCompileError: boolean;
  compileOutput?: string;
  testCaseResults: TestCaseResultDto[];
  totalExecutionTime: number; // Sum of all test case execution times
  totalNetworkTime: number;
  totalTime: number;
  submittedAt: Date;
  status: 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED';

  constructor(partial: Partial<SubmissionResultDto>) {
    Object.assign(this, partial);
    this.submittedAt = new Date();
  }
}

// Language info from Piston
export class LanguageInfoDto {
  language: string;
  version: string;
  aliases: string[];
  runtime?: string;

  constructor(partial: Partial<LanguageInfoDto>) {
    Object.assign(this, partial);
  }
}
