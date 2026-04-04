// ==================== Subject & Topic Response DTOs ====================

export class SubjectResponseDto {
  id: string;
  name: string;
  description: string | null;
  topicCount?: number;
  questionCount?: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<SubjectResponseDto>) {
    Object.assign(this, partial);
  }
}

export class TopicResponseDto {
  id: string;
  name: string;
  subjectId: string;
  questionCount?: number;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<TopicResponseDto>) {
    Object.assign(this, partial);
  }
}

// ==================== Question Choice Response DTO ====================

export class QuestionChoiceResponseDto {
  id: string;
  content: string;
  isCorrect: boolean;
  order: number;

  constructor(partial: Partial<QuestionChoiceResponseDto>) {
    Object.assign(this, partial);
  }
}

// ==================== Question Response DTOs ====================

export class QuestionDetailResponseDto {
  id: string;
  content: string;
  imageUrl: string | null;
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
  classification: 'PRACTICE' | 'EXAM';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  correctAnswer: string | null;
  explanation: string | null;
  isPublished: boolean;
  subjectId: string;
  topicId: string | null;
  creatorId: string;
  subject?: SubjectResponseDto;
  topic?: TopicResponseDto | null;
  choices?: QuestionChoiceResponseDto[];
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<QuestionDetailResponseDto>) {
    Object.assign(this, partial);
  }
}

export class QuestionListItemDto {
  id: string;
  content: string;
  imageUrl: string | null;
  questionType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
  classification: 'PRACTICE' | 'EXAM';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  isPublished: boolean;
  subjectId: string;
  topicId: string | null;
  subject?: { id: string; name: string };
  topic?: { id: string; name: string } | null;
  choiceCount?: number;
  createdAt: Date;

  constructor(partial: Partial<QuestionListItemDto>) {
    Object.assign(this, partial);
  }
}

export class PaginatedQuestionsDto {
  data: QuestionListItemDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;

  constructor(partial: Partial<PaginatedQuestionsDto>) {
    Object.assign(this, partial);
  }
}
