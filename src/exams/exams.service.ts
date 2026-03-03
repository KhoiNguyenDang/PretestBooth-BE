import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { shuffleWithSeed } from './utils/shuffle';

import type { CreateExamDto } from './dto/create-exam.dto';
import type { UpdateExamDto } from './dto/update-exam.dto';
import type { QueryExamDto } from './dto/query-exam.dto';
import type { SaveAnswerDto } from './dto/save-answer.dto';
import type { GradeSessionDto } from './dto/grade-session.dto';
import {
  ExamListItemDto,
  ExamDetailDto,
  ExamItemDto,
  ExamQuestionDto,
  ExamChoiceDto,
  ExamProblemDto,
  PaginatedExamsDto,
  ShuffledSessionDto,
  ShuffledItemDto,
  SessionAnswerDto,
  SessionResultDto,
  SessionResultItemDto,
} from './dto/exam-response.dto';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

@Injectable()
export class ExamsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== EXAM CRUD ====================

  /**
   * Generate and save an exam by randomly selecting questions/problems matching filters.
   */
  async create(creatorId: string, userRole: string, dto: CreateExamDto): Promise<ExamDetailDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể tạo đề thi');
    }

    // Validate subject if provided
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!subject) throw new NotFoundException('Môn học không tồn tại');
    }

    // Validate topic if provided
    if (dto.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
      if (!topic) throw new NotFoundException('Chủ đề không tồn tại');
      if (dto.subjectId && topic.subjectId !== dto.subjectId) {
        throw new BadRequestException('Chủ đề không thuộc môn học đã chọn');
      }
    }

    // Determine if manual selection or random selection
    const isManualQuestions = dto.questionIds && dto.questionIds.length > 0;
    const isManualProblems = dto.problemIds && dto.problemIds.length > 0;

    let finalQuestionIds: string[] = [];
    let finalProblemIds: string[] = [];

    if (isManualQuestions) {
      // Validate all provided question IDs exist and are published
      const foundQuestions = await this.prisma.question.findMany({
        where: { id: { in: dto.questionIds! }, isPublished: true },
        select: { id: true },
      });
      const foundIds = new Set(foundQuestions.map((q) => q.id));
      const missing = dto.questionIds!.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Các câu hỏi không tồn tại hoặc chưa được xuất bản: ${missing.join(', ')}`,
        );
      }
      finalQuestionIds = dto.questionIds!;
    } else if (dto.questionCount > 0) {
      // Random selection (existing logic)
      const questionWhere: Prisma.QuestionWhereInput = { isPublished: true };
      if (dto.subjectId) questionWhere.subjectId = dto.subjectId;
      if (dto.topicId) questionWhere.topicId = dto.topicId;
      if (dto.difficulty) questionWhere.difficulty = dto.difficulty as Difficulty;

      const allQuestionIds = (
        await this.prisma.question.findMany({ where: questionWhere, select: { id: true } })
      ).map((q) => q.id);

      if (allQuestionIds.length < dto.questionCount) {
        throw new BadRequestException(
          `Không đủ câu hỏi. Yêu cầu ${dto.questionCount}, hiện có ${allQuestionIds.length} câu hỏi phù hợp.`,
        );
      }
      finalQuestionIds = this.pickRandom(allQuestionIds, dto.questionCount);
    }

    if (isManualProblems) {
      // Validate all provided problem IDs exist and are published
      const foundProblems = await this.prisma.problem.findMany({
        where: { id: { in: dto.problemIds! }, isPublished: true },
        select: { id: true },
      });
      const foundIds = new Set(foundProblems.map((p) => p.id));
      const missing = dto.problemIds!.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Các bài code không tồn tại hoặc chưa được xuất bản: ${missing.join(', ')}`,
        );
      }
      finalProblemIds = dto.problemIds!;
    } else if (dto.problemCount > 0) {
      // Random selection (existing logic)
      const problemWhere: Prisma.ProblemWhereInput = { isPublished: true };
      if (dto.includeProblemsRelatedToQuestions) {
        if (dto.subjectId) problemWhere.subjectId = dto.subjectId;
        if (dto.topicId) problemWhere.topicId = dto.topicId;
      }
      if (dto.difficulty) problemWhere.difficulty = dto.difficulty as Difficulty;

      const allProblemIds = (
        await this.prisma.problem.findMany({ where: problemWhere, select: { id: true } })
      ).map((p) => p.id);

      if (allProblemIds.length < dto.problemCount) {
        throw new BadRequestException(
          `Không đủ bài code. Yêu cầu ${dto.problemCount}, hiện có ${allProblemIds.length} bài phù hợp.`,
        );
      }
      finalProblemIds = this.pickRandom(allProblemIds, dto.problemCount);
    }

    const effectiveQuestionCount = isManualQuestions ? finalQuestionIds.length : dto.questionCount;
    const effectiveProblemCount = isManualProblems ? finalProblemIds.length : dto.problemCount;

    // Create exam + items in a transaction
    const exam = await this.prisma.$transaction(async (tx) => {
      const createdExam = await tx.exam.create({
        data: {
          title: dto.title,
          description: dto.description || null,
          questionCount: effectiveQuestionCount,
          problemCount: effectiveProblemCount,
          duration: dto.duration,
          difficulty: (dto.difficulty as Difficulty) || null,
          includeProblemsRelatedToQuestions: dto.includeProblemsRelatedToQuestions,
          shuffleQuestions: dto.shuffleQuestions,
          shuffleChoices: dto.shuffleChoices,
          subjectId: dto.subjectId || null,
          topicId: dto.topicId || null,
          creatorId,
        },
      });

      // Create ExamItems for questions
      const questionItems = finalQuestionIds.map((questionId, index) => ({
        examId: createdExam.id,
        questionId,
        problemId: null as string | null,
        section: 'QUESTION' as const,
        order: index,
        points: 1.0,
      }));

      // Create ExamItems for problems
      const problemItems = finalProblemIds.map((problemId, index) => ({
        examId: createdExam.id,
        questionId: null as string | null,
        problemId,
        section: 'PROBLEM' as const,
        order: finalQuestionIds.length + index,
        points: 1.0,
      }));

      if (questionItems.length > 0 || problemItems.length > 0) {
        await tx.examItem.createMany({
          data: [...questionItems, ...problemItems],
        });
      }

      return tx.exam.findUniqueOrThrow({
        where: { id: createdExam.id },
        include: {
          subject: { select: { id: true, name: true } },
          topic: { select: { id: true, name: true } },
          items: {
            orderBy: { order: 'asc' },
            include: {
              question: { include: { choices: { orderBy: { order: 'asc' } } } },
              problem: true,
            },
          },
          _count: { select: { sessions: true } },
        },
      });
    });

    return this.mapToExamDetail(exam);
  }

  /**
   * List exams with pagination and filters.
   */
  async findAll(query: QueryExamDto, userId: string, userRole: string): Promise<PaginatedExamsDto> {
    const { page, limit, subjectId, topicId, difficulty, search, isPublished, sortBy, sortOrder } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.ExamWhereInput = {};

    // Students only see published exams
    if (userRole === 'STUDENT') {
      where.isPublished = true;
    } else if (isPublished !== undefined) {
      where.isPublished = isPublished;
    }

    if (subjectId) where.subjectId = subjectId;
    if (topicId) where.topicId = topicId;
    if (difficulty) where.difficulty = difficulty as Difficulty;
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const orderBy: Prisma.ExamOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [exams, total] = await Promise.all([
      this.prisma.exam.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          subject: { select: { id: true, name: true } },
          topic: { select: { id: true, name: true } },
          _count: { select: { items: true, sessions: true } },
        },
      }),
      this.prisma.exam.count({ where }),
    ]);

    const data = exams.map(
      (e) =>
        new ExamListItemDto({
          id: e.id,
          title: e.title,
          description: e.description,
          questionCount: e.questionCount,
          problemCount: e.problemCount,
          duration: e.duration,
          difficulty: e.difficulty,
          isPublished: e.isPublished,
          subjectId: e.subjectId,
          topicId: e.topicId,
          subject: e.subject,
          topic: e.topic,
          creatorId: e.creatorId,
          totalItems: e._count.items,
          sessionCount: e._count.sessions,
          shuffleQuestions: e.shuffleQuestions,
          shuffleChoices: e.shuffleChoices,
          createdAt: e.createdAt,
        }),
    );

    return new PaginatedExamsDto({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  /**
   * Get exam detail by ID.
   */
  async findOne(id: string, userId: string, userRole: string): Promise<ExamDetailDto> {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        items: {
          orderBy: { order: 'asc' },
          include: {
            question: { include: { choices: { orderBy: { order: 'asc' } } } },
            problem: true,
          },
        },
        _count: { select: { sessions: true } },
      },
    });

    if (!exam) throw new NotFoundException('Đề thi không tồn tại');

    if (!exam.isPublished && userRole === 'STUDENT') {
      throw new ForbiddenException('Bạn không có quyền xem đề thi này');
    }

    return this.mapToExamDetail(exam);
  }

  /**
   * Update exam metadata.
   */
  async update(
    id: string,
    dto: UpdateExamDto,
    userId: string,
    userRole: string,
  ): Promise<ExamDetailDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể cập nhật đề thi');
    }

    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Đề thi không tồn tại');

    if (exam.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa đề thi này');
    }

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.duration && { duration: dto.duration }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        ...(dto.shuffleQuestions !== undefined && { shuffleQuestions: dto.shuffleQuestions }),
        ...(dto.shuffleChoices !== undefined && { shuffleChoices: dto.shuffleChoices }),
      },
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
        items: {
          orderBy: { order: 'asc' },
          include: {
            question: { include: { choices: { orderBy: { order: 'asc' } } } },
            problem: true,
          },
        },
        _count: { select: { sessions: true } },
      },
    });

    return this.mapToExamDetail(updated);
  }

  /**
   * Delete an exam.
   */
  async remove(id: string, userId: string, userRole: string): Promise<{ message: string }> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể xóa đề thi');
    }

    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Đề thi không tồn tại');

    if (exam.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa đề thi này');
    }

    await this.prisma.exam.delete({ where: { id } });
    return { message: 'Xóa đề thi thành công' };
  }

  // ==================== EXAM SESSION ====================

  /**
   * Start an exam session for a student.
   * Generates a random seed and returns shuffled items.
   */
  async startSession(examId: string, userId: string): Promise<ShuffledSessionDto> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            question: { include: { choices: { orderBy: { order: 'asc' } } } },
            problem: true,
          },
        },
      },
    });

    if (!exam) throw new NotFoundException('Đề thi không tồn tại');
    if (!exam.isPublished) throw new ForbiddenException('Đề thi chưa được công bố');

    // Check if there's an existing session
    const existingSession = await this.prisma.examSession.findUnique({
      where: { examId_userId: { examId, userId } },
    });

    if (existingSession) {
      if (existingSession.status === 'SUBMITTED' || existingSession.status === 'GRADED') {
        throw new ConflictException('Bạn đã hoàn thành đề thi này rồi');
      }
      // Resume existing session
      return this.getSessionData(existingSession.id, userId);
    }

    // Generate random seed
    const seed = crypto.randomInt(0, 2147483647);

    // Create new session
    const session = await this.prisma.examSession.create({
      data: {
        examId,
        userId,
        seed,
        maxScore: exam.items.reduce((sum, item) => sum + item.points, 0),
      },
    });

    return this.buildShuffledSession(session, exam);
  }

  /**
   * Get an existing session (for resume).
   */
  async getSessionData(sessionId: string, userId: string): Promise<ShuffledSessionDto> {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: {
          include: {
            items: {
              orderBy: { order: 'asc' },
              include: {
                question: { include: { choices: { orderBy: { order: 'asc' } } } },
                problem: true,
              },
            },
          },
        },
        answers: true,
      },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');
    if (session.userId !== userId)
      throw new ForbiddenException('Bạn không có quyền xem phiên thi này');

    return this.buildShuffledSession(session, session.exam, session.answers);
  }

  /**
   * Save an individual answer (auto-save).
   */
  async saveAnswer(
    sessionId: string,
    userId: string,
    dto: SaveAnswerDto,
  ): Promise<SessionAnswerDto> {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');
    if (session.userId !== userId)
      throw new ForbiddenException('Bạn không có quyền trả lời phiên thi này');
    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Phiên thi đã kết thúc, không thể cập nhật câu trả lời');
    }

    // Verify the exam item belongs to this exam
    const examItem = await this.prisma.examItem.findUnique({
      where: { id: dto.examItemId },
    });
    if (!examItem || examItem.examId !== session.examId) {
      throw new BadRequestException('Câu hỏi không thuộc đề thi này');
    }

    // Upsert the answer
    const answer = await this.prisma.examSessionAnswer.upsert({
      where: {
        sessionId_examItemId: { sessionId, examItemId: dto.examItemId },
      },
      create: {
        sessionId,
        examItemId: dto.examItemId,
        selectedChoiceIds: dto.selectedChoiceIds || [],
        textAnswer: dto.textAnswer || null,
        submissionId: dto.submissionId || null,
      },
      update: {
        selectedChoiceIds: dto.selectedChoiceIds || [],
        textAnswer: dto.textAnswer || null,
        submissionId: dto.submissionId || null,
      },
    });

    return new SessionAnswerDto({
      id: answer.id,
      examItemId: answer.examItemId,
      selectedChoiceIds: answer.selectedChoiceIds,
      textAnswer: answer.textAnswer,
      submissionId: answer.submissionId,
      isCorrect: answer.isCorrect,
      score: answer.score,
    });
  }

  /**
   * Submit a session: auto-score MC, mark others as pending.
   */
  async submitSession(sessionId: string, userId: string): Promise<SessionResultDto> {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: true,
        answers: {
          include: {
            examItem: {
              include: {
                question: { include: { choices: true } },
                problem: true,
              },
            },
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');
    if (session.userId !== userId)
      throw new ForbiddenException('Bạn không có quyền nộp phiên thi này');
    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Phiên thi đã được nộp rồi');
    }

    // Auto-score MC questions
    let totalScore = 0;
    const answerUpdates: { id: string; isCorrect: boolean; score: number }[] = [];

    for (const answer of session.answers) {
      const item = answer.examItem;

      if (item.section === 'QUESTION' && item.question) {
        const question = item.question;

        if (
          question.questionType === 'SINGLE_CHOICE' ||
          question.questionType === 'MULTIPLE_CHOICE'
        ) {
          // Get correct choice IDs
          const correctChoiceIds = question.choices
            .filter((c) => c.isCorrect)
            .map((c) => c.id)
            .sort();

          const selectedIds = [...answer.selectedChoiceIds].sort();

          // Check if arrays match
          const isCorrect =
            correctChoiceIds.length === selectedIds.length &&
            correctChoiceIds.every((id, idx) => id === selectedIds[idx]);

          const itemScore = isCorrect ? item.points : 0;
          totalScore += itemScore;

          answerUpdates.push({ id: answer.id, isCorrect, score: itemScore });
        }
        // SHORT_ANSWER left as null (pending manual grading)
      }
      // PROBLEM items left as null (pending manual grading)
    }

    // Update all answers and session in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const update of answerUpdates) {
        await tx.examSessionAnswer.update({
          where: { id: update.id },
          data: { isCorrect: update.isCorrect, score: update.score },
        });
      }

      await tx.examSession.update({
        where: { id: sessionId },
        data: {
          status: 'SUBMITTED',
          finishedAt: new Date(),
          score: totalScore,
        },
      });
    });

    return this.getSessionResult(sessionId, userId);
  }

  /**
   * Get session results.
   */
  async getSessionResult(
    sessionId: string,
    userId: string,
    userRole?: string,
  ): Promise<SessionResultDto> {
    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      include: {
        exam: true,
        answers: {
          include: {
            examItem: {
              include: {
                question: true,
                problem: true,
              },
            },
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');

    // Only owner or lecturers can view results
    const isOwner = session.userId === userId;
    const isLecturer = userRole && ['LECTURER', 'ADMIN'].includes(userRole);
    if (!isOwner && !isLecturer) {
      throw new ForbiddenException('Bạn không có quyền xem kết quả phiên thi này');
    }

    const items = session.answers.map(
      (a) =>
        new SessionResultItemDto({
          examItemId: a.examItemId,
          section: a.examItem.section as 'QUESTION' | 'PROBLEM',
          points: a.examItem.points,
          isCorrect: a.isCorrect,
          score: a.score,
          questionContent: a.examItem.question?.content,
          problemTitle: a.examItem.problem?.title,
          selectedChoiceIds: a.selectedChoiceIds,
          textAnswer: a.textAnswer,
        }),
    );

    const correctItems = items.filter((i) => i.isCorrect === true).length;
    const pendingItems = items.filter((i) => i.isCorrect === null).length;

    return new SessionResultDto({
      id: session.id,
      examId: session.examId,
      examTitle: session.exam.title,
      status: session.status,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      score: session.score,
      maxScore: session.maxScore,
      totalItems: items.length,
      correctItems,
      pendingItems,
      items,
    });
  }

  /**
   * Manual grading by lecturer.
   */
  async gradeSession(
    sessionId: string,
    dto: GradeSessionDto,
    userId: string,
    userRole: string,
  ): Promise<SessionResultDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể chấm điểm');
    }

    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');
    if (session.status === 'IN_PROGRESS') {
      throw new BadRequestException('Phiên thi chưa được nộp');
    }

    // Update grades in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.examSessionAnswer.update({
          where: {
            sessionId_examItemId: { sessionId, examItemId: item.examItemId },
          },
          data: {
            isCorrect: item.isCorrect,
            score: item.score,
          },
        });
      }

      // Recalculate total score
      const allAnswers = await tx.examSessionAnswer.findMany({
        where: { sessionId },
      });

      const totalScore = allAnswers.reduce((sum, a) => sum + (a.score || 0), 0);
      const allGraded = allAnswers.every((a) => a.isCorrect !== null);

      await tx.examSession.update({
        where: { id: sessionId },
        data: {
          score: totalScore,
          status: allGraded ? 'GRADED' : 'SUBMITTED',
        },
      });
    });

    return this.getSessionResult(sessionId, userId, userRole);
  }

  // ==================== HELPER METHODS ====================

  /**
   * Pick N random elements from an array using crypto.randomInt.
   */
  private pickRandom<T>(array: T[], count: number): T[] {
    if (count >= array.length) return [...array];
    const result: T[] = [];
    const available = [...array];
    for (let i = 0; i < count; i++) {
      const idx = crypto.randomInt(0, available.length);
      result.push(available[idx]);
      available.splice(idx, 1);
    }
    return result;
  }

  /**
   * Build a shuffled session response from a session and exam data.
   */
  private buildShuffledSession(
    session: any,
    exam: any,
    existingAnswers?: any[],
  ): ShuffledSessionDto {
    const seed = session.seed;

    // Separate items by section
    const questionItems = exam.items.filter((i: any) => i.section === 'QUESTION');
    const problemItems = exam.items.filter((i: any) => i.section === 'PROBLEM');

    // Shuffle each section independently (respect exam settings)
    const shuffledQuestions = exam.shuffleQuestions
      ? shuffleWithSeed(questionItems, seed)
      : questionItems;
    const shuffledProblems = exam.shuffleQuestions
      ? shuffleWithSeed(problemItems, seed + 1)
      : problemItems;

    // Map to response DTOs
    const mapItem = (item: any, index: number, sectionSeed: number): ShuffledItemDto => {
      const dto: any = {
        id: item.id,
        section: item.section,
        order: index,
        points: item.points,
      };

      if (item.question) {
        // Shuffle choices only if exam.shuffleChoices is true
        const choices = item.question.choices || [];
        const choiceSeed = sectionSeed + index + 2;
        const finalChoices = exam.shuffleChoices ? shuffleWithSeed(choices, choiceSeed) : choices;

        dto.question = new ExamQuestionDto({
          id: item.question.id,
          content: item.question.content,
          questionType: item.question.questionType,
          difficulty: item.question.difficulty,
          choices: finalChoices.map(
            (c: any, cIdx: number) =>
              new ExamChoiceDto({
                id: c.id,
                content: c.content,
                order: cIdx,
              }),
          ),
        });
      }

      if (item.problem) {
        dto.problem = new ExamProblemDto({
          id: item.problem.id,
          title: item.problem.title,
          slug: item.problem.slug,
          description: item.problem.description,
          difficulty: item.problem.difficulty,
          starterCode: item.problem.starterCode,
          constraints: item.problem.constraints,
          hints: item.problem.hints,
          timeLimit: item.problem.timeLimit,
          memoryLimit: item.problem.memoryLimit,
          functionName: item.problem.functionName,
          inputTypes: item.problem.inputTypes,
          outputType: item.problem.outputType,
          argNames: item.problem.argNames,
        });
      }

      return new ShuffledItemDto(dto);
    };

    const mappedQuestions = shuffledQuestions.map((item: any, idx: number) =>
      mapItem(item, idx, seed),
    );
    const mappedProblems = shuffledProblems.map((item: any, idx: number) =>
      mapItem(item, idx, seed + 1),
    );

    // Map existing answers
    const answers = (existingAnswers || []).map(
      (a: any) =>
        new SessionAnswerDto({
          id: a.id,
          examItemId: a.examItemId,
          selectedChoiceIds: a.selectedChoiceIds,
          textAnswer: a.textAnswer,
          submissionId: a.submissionId,
          isCorrect: a.isCorrect,
          score: a.score,
        }),
    );

    return new ShuffledSessionDto({
      id: session.id,
      examId: exam.id,
      examTitle: exam.title,
      duration: exam.duration,
      status: session.status,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      score: session.score,
      maxScore: session.maxScore,
      questionItems: mappedQuestions,
      problemItems: mappedProblems,
      answers,
    });
  }

  /**
   * Map a Prisma exam to ExamDetailDto.
   */
  private mapToExamDetail(exam: any): ExamDetailDto {
    const items = (exam.items || []).map(
      (item: any) =>
        new ExamItemDto({
          id: item.id,
          section: item.section,
          order: item.order,
          points: item.points,
          questionId: item.questionId,
          problemId: item.problemId,
          question: item.question
            ? new ExamQuestionDto({
                id: item.question.id,
                content: item.question.content,
                questionType: item.question.questionType,
                difficulty: item.question.difficulty,
                choices: (item.question.choices || []).map(
                  (c: any) =>
                    new ExamChoiceDto({
                      id: c.id,
                      content: c.content,
                      order: c.order,
                    }),
                ),
              })
            : null,
          problem: item.problem
            ? new ExamProblemDto({
                id: item.problem.id,
                title: item.problem.title,
                slug: item.problem.slug,
                description: item.problem.description,
                difficulty: item.problem.difficulty,
                starterCode: item.problem.starterCode,
                constraints: item.problem.constraints,
                hints: item.problem.hints,
                timeLimit: item.problem.timeLimit,
                memoryLimit: item.problem.memoryLimit,
                functionName: item.problem.functionName,
                inputTypes: item.problem.inputTypes,
                outputType: item.problem.outputType,
                argNames: item.problem.argNames,
              })
            : null,
        }),
    );

    return new ExamDetailDto({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      questionCount: exam.questionCount,
      problemCount: exam.problemCount,
      duration: exam.duration,
      difficulty: exam.difficulty,
      includeProblemsRelatedToQuestions: exam.includeProblemsRelatedToQuestions,
      isPublished: exam.isPublished,
      subjectId: exam.subjectId,
      topicId: exam.topicId,
      subject: exam.subject,
      topic: exam.topic,
      creatorId: exam.creatorId,
      items,
      sessionCount: exam._count?.sessions || 0,
      shuffleQuestions: exam.shuffleQuestions,
      shuffleChoices: exam.shuffleChoices,
      createdAt: exam.createdAt,
      updatedAt: exam.updatedAt,
    });
  }
}
