export class TestCaseResponseDto {
  id: string;
  input: string;
  expectedOutput: string;
  explanation: string | null;
  isHidden: boolean;
  isSample: boolean;
  order: number;

  constructor(partial: Partial<TestCaseResponseDto>) {
    Object.assign(this, partial);
  }
}

export class ProblemResponseDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  starterCode: Record<string, string> | null;
  constraints: string | null;
  hints: string[];
  timeLimit: number;
  memoryLimit: number;
  functionName: string;
  inputTypes: string[];
  outputType: string;
  argNames: string[];
  totalSubmissions: number;
  acceptedSubmissions: number;
  acceptanceRate: number;
  isPublished: boolean;
  creatorId: string;
  subjectId: string | null;
  topicId: string | null;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  testCases?: TestCaseResponseDto[];
  sampleTestCases?: TestCaseResponseDto[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<ProblemResponseDto>) {
    Object.assign(this, partial);
    // Calculate acceptance rate
    if (partial.totalSubmissions && partial.totalSubmissions > 0) {
      this.acceptanceRate = Math.round(
        ((partial.acceptedSubmissions || 0) / partial.totalSubmissions) * 100,
      );
    } else {
      this.acceptanceRate = 0;
    }
  }
}

export class ProblemListItemDto {
  id: string;
  title: string;
  slug: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  acceptanceRate: number;
  totalSubmissions: number;
  isPublished: boolean;
  subjectId: string | null;
  topicId: string | null;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;

  constructor(partial: Partial<ProblemListItemDto>) {
    Object.assign(this, partial);
  }
}

export class PaginatedProblemsDto {
  data: ProblemListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;

  constructor(partial: Partial<PaginatedProblemsDto>) {
    Object.assign(this, partial);
  }
}
