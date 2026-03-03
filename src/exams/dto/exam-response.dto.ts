// ==================== Exam Response DTOs ====================

export class ExamListItemDto {
  id: string;
  title: string;
  description: string | null;
  questionCount: number;
  problemCount: number;
  duration: number;
  difficulty: string | null;
  isPublished: boolean;
  subjectId: string | null;
  topicId: string | null;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  creatorId: string;
  totalItems: number;
  sessionCount: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  createdAt: Date;

  constructor(partial: Partial<ExamListItemDto>) {
    Object.assign(this, partial);
  }
}

export class ExamDetailDto {
  id: string;
  title: string;
  description: string | null;
  questionCount: number;
  problemCount: number;
  duration: number;
  difficulty: string | null;
  includeProblemsRelatedToQuestions: boolean;
  isPublished: boolean;
  subjectId: string | null;
  topicId: string | null;
  subject?: { id: string; name: string } | null;
  topic?: { id: string; name: string } | null;
  creatorId: string;
  items: ExamItemDto[];
  sessionCount: number;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<ExamDetailDto>) {
    Object.assign(this, partial);
  }
}

export class ExamItemDto {
  id: string;
  section: 'QUESTION' | 'PROBLEM';
  order: number;
  points: number;
  questionId: string | null;
  problemId: string | null;
  question?: ExamQuestionDto | null;
  problem?: ExamProblemDto | null;

  constructor(partial: Partial<ExamItemDto>) {
    Object.assign(this, partial);
  }
}

export class ExamQuestionDto {
  id: string;
  content: string;
  questionType: string;
  difficulty: string;
  choices?: ExamChoiceDto[];

  constructor(partial: Partial<ExamQuestionDto>) {
    Object.assign(this, partial);
  }
}

export class ExamChoiceDto {
  id: string;
  content: string;
  order: number;
  // isCorrect is intentionally omitted for student-facing responses

  constructor(partial: Partial<ExamChoiceDto>) {
    Object.assign(this, partial);
  }
}

export class ExamProblemDto {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  starterCode: any;
  constraints: string | null;
  hints: string[];
  timeLimit: number;
  memoryLimit: number;
  functionName: string;
  inputTypes: string[];
  outputType: string;
  argNames: string[];

  constructor(partial: Partial<ExamProblemDto>) {
    Object.assign(this, partial);
  }
}

export class PaginatedExamsDto {
  data: ExamListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;

  constructor(partial: Partial<PaginatedExamsDto>) {
    Object.assign(this, partial);
  }
}

// ==================== Session Response DTOs ====================

export class ShuffledSessionDto {
  id: string;
  examId: string;
  examTitle: string;
  duration: number;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  questionItems: ShuffledItemDto[];
  problemItems: ShuffledItemDto[];
  answers: SessionAnswerDto[];

  constructor(partial: Partial<ShuffledSessionDto>) {
    Object.assign(this, partial);
  }
}

export class ShuffledItemDto {
  id: string;
  section: 'QUESTION' | 'PROBLEM';
  order: number;
  points: number;
  question?: ExamQuestionDto | null;
  problem?: ExamProblemDto | null;

  constructor(partial: Partial<ShuffledItemDto>) {
    Object.assign(this, partial);
  }
}

export class SessionAnswerDto {
  id: string;
  examItemId: string;
  selectedChoiceIds: string[];
  textAnswer: string | null;
  submissionId: string | null;
  isCorrect: boolean | null;
  score: number | null;

  constructor(partial: Partial<SessionAnswerDto>) {
    Object.assign(this, partial);
  }
}

export class SessionResultDto {
  id: string;
  examId: string;
  examTitle: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  totalItems: number;
  correctItems: number;
  pendingItems: number;
  items: SessionResultItemDto[];

  constructor(partial: Partial<SessionResultDto>) {
    Object.assign(this, partial);
  }
}

export class SessionResultItemDto {
  examItemId: string;
  section: 'QUESTION' | 'PROBLEM';
  points: number;
  isCorrect: boolean | null;
  score: number | null;
  questionContent?: string;
  problemTitle?: string;
  selectedChoiceIds: string[];
  textAnswer: string | null;

  constructor(partial: Partial<SessionResultItemDto>) {
    Object.assign(this, partial);
  }
}
