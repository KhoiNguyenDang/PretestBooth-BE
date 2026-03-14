import type { SubmissionStatus } from '@prisma/client';

// Test case result stored in JSON
export interface TestCaseResultJson {
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
  message: string;
}

// Single submission response
export class SubmissionResponseDto {
  id: string;
  language: string;
  languageVersion: string | null;
  sourceCode: string;
  status: SubmissionStatus;
  totalTestCases: number;
  passedTestCases: number;
  failedTestCases: number;
  executionTime: number | null;
  networkTime: number | null;
  totalTime: number | null;
  compileOutput: string | null;
  errorMessage: string | null;
  testCaseResults: TestCaseResultJson[] | null;
  userId: string;
  problemId: string;
  createdAt: Date;

  // Optional related data
  problem?: {
    id: string;
    title: string;
    slug: string;
    difficulty: string;
  };
  user?: {
    id: string;
    email: string;
    studentCode: string | null;
  };

  constructor(partial: Partial<SubmissionResponseDto>) {
    Object.assign(this, partial);
  }
}

// Submission list item (without source code for list view)
export class SubmissionListItemDto {
  id: string;
  language: string;
  status: SubmissionStatus;
  totalTestCases: number;
  passedTestCases: number;
  executionTime: number | null;
  totalTime: number | null;
  problemId: string;
  createdAt: Date;

  problem?: {
    id: string;
    title: string;
    slug: string;
    difficulty: string;
  };

  constructor(partial: Partial<SubmissionListItemDto>) {
    Object.assign(this, partial);
  }
}

// Paginated submissions response
export class PaginatedSubmissionsDto {
  data: SubmissionListItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  constructor(partial: Partial<PaginatedSubmissionsDto>) {
    Object.assign(this, partial);
  }
}

// Submission stats for a user on a problem
export class SubmissionStatsDto {
  totalSubmissions: number;
  acceptedSubmissions: number;
  bestTime: number | null;
  lastSubmissionAt: Date | null;
  languages: string[];

  constructor(partial: Partial<SubmissionStatsDto>) {
    Object.assign(this, partial);
  }
}
