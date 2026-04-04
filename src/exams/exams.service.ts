import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from '../execution/execution.service';
import { SubmissionsService } from '../submissions/submissions.service';
import { BookingsService } from '../bookings/bookings.service';
import { PointsService } from '../points/points.service';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { shuffleWithSeed } from './utils/shuffle';
import { AuthorizationService } from '../common/authorization/authorization.service';

import type { CreateExamDto } from './dto/create-exam.dto';
import type { UpdateExamDto } from './dto/update-exam.dto';
import type { QueryExamDto } from './dto/query-exam.dto';
import type { SaveAnswerDto } from './dto/save-answer.dto';
import type { GradeSessionDto } from './dto/grade-session.dto';
import type { QueryExamSessionsDto } from './dto/query-exam-sessions.dto';
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
  SessionResultChoiceDto,
  SessionResultItemDto,
  SessionResultSubmissionDto,
  SessionResultTestCaseDto,
  ExamSessionListItemDto,
  PaginatedExamSessionsDto,
} from './dto/exam-response.dto';
import type { TestCaseResultJson } from '../submissions/dto/submission-response.dto';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
type QuestionClassification = 'PRACTICE' | 'EXAM';
type AllocationPolicy = 'STRICT' | 'FLEXIBLE';
type ExamVisibility = 'PRIVATE' | 'PUBLIC';

@Injectable()
export class ExamsService {
  private readonly logger = new Logger(ExamsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
    private readonly submissionsService: SubmissionsService,
    private readonly bookingsService: BookingsService,
    private readonly pointsService: PointsService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async assertExamManagementPermission(userId: string, userRole: string, actionLabel: string) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (userRole !== 'LECTURER') {
      throw new ForbiddenException(`Chỉ giảng viên và quản trị viên mới có thể ${actionLabel}`);
    }

    await this.authorizationService.assertPermission(
      userId,
      userRole,
      'CREATE_EXAM',
      'Giảng viên chưa được cấp quyền quản lý đề thi',
    );
  }

  /**
   * Check if a session has exceeded its time limit
   * @param session - ExamSession to check
   * @param durationMinutes - Exam duration in minutes (from exam.duration)
   * @returns true if session time has expired
   */
  private isSessionExpired(session: { startedAt: Date; expiresAt?: Date }, durationMinutes: number): boolean {
    const now = Date.now();
    // If expiresAt is set, use it; otherwise calculate from startedAt
    const deadline = session.expiresAt ? session.expiresAt.getTime() : session.startedAt.getTime() + durationMinutes * 60 * 1000;
    return now > deadline;
  }

  private calculateExamCompletionPoints(score: number, maxScore: number | null): number {
    if (!maxScore || maxScore <= 0) {
      return 5;
    }

    const ratio = Math.max(0, Math.min(1, score / maxScore));
    // Formula: 5 + 15 * performance ratio, rounded to integer and capped to [5, 20]
    const computed = Math.round(5 + 15 * ratio);
    return Math.max(5, Math.min(20, computed));
  }

  private async syncExamCompletionPoints(
    sessionId: string,
    userId: string,
    score: number,
    maxScore: number | null,
  ) {
    const sessionMeta = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      select: {
        bookingId: true,
        exam: {
          select: { type: true },
        },
      },
    });

    if (!sessionMeta) {
      return;
    }

    const isOnlinePracticeSession =
      sessionMeta.exam.type === 'PRACTICE' && !sessionMeta.bookingId;
    const targetPoints = isOnlinePracticeSession
      ? 0
      : this.calculateExamCompletionPoints(score, maxScore);

    const existingTransactions = await this.prisma.pointTransaction.findMany({
      where: {
        userId,
        type: 'EXAM_COMPLETION',
        examSessionId: sessionId,
      },
      select: { points: true },
    });

    const currentlyAwarded = existingTransactions.reduce((sum, tx) => sum + tx.points, 0);
    const delta = targetPoints - currentlyAwarded;

    if (delta === 0) {
      return;
    }

    await this.pointsService.addTransaction(
      userId,
      'EXAM_COMPLETION',
      delta,
      `Điều chỉnh điểm hoàn thành bài thi: ${score}/${maxScore ?? 0}`,
      { examSessionId: sessionId },
    );
  }

  // ==================== EXAM CRUD ====================

  async createRandom(
    creatorId: string,
    userRole: string,
    dto: CreateExamDto,
  ): Promise<ExamDetailDto> {
    return this.create(creatorId, userRole, {
      ...dto,
      generationMode: 'RANDOM',
      questionIds: undefined,
      problemIds: undefined,
    });
  }

  async createManual(
    creatorId: string,
    userRole: string,
    dto: CreateExamDto,
  ): Promise<ExamDetailDto> {
    return this.create(creatorId, userRole, {
      ...dto,
      generationMode: 'MANUAL',
      allocationPolicy: 'STRICT',
      questionCount: 0,
      problemCount: 0,
      difficulty: null,
      questionDifficultyDistribution: undefined,
      questionAllocationRules: undefined,
    });
  }

  /**
   * Generate and save an exam by randomly selecting questions/problems matching filters.
   */
  async create(creatorId: string, userRole: string, dto: CreateExamDto): Promise<ExamDetailDto> {
    await this.assertExamManagementPermission(creatorId, userRole, 'tạo đề thi');

    const selectedSubjectIds = dto.subjectIds?.length
      ? dto.subjectIds
      : dto.subjectId
        ? [dto.subjectId]
        : [];
    const ruleSubjectIds = dto.questionAllocationRules?.map((r) => r.subjectId) || [];
    const subjectIdsToValidate = [...new Set([...selectedSubjectIds, ...ruleSubjectIds])];
    const allocationPolicy: AllocationPolicy = dto.allocationPolicy || 'STRICT';
    const questionClassificationFilter: QuestionClassification | undefined =
      dto.type === 'PRACTICE' ? 'PRACTICE' : undefined;
    const isFlexibleAllocation = allocationPolicy === 'FLEXIBLE';
    let subjectNameById: Record<string, string> = {};

    // Validate subjects if provided
    if (subjectIdsToValidate.length > 0) {
      const subjects = await this.prisma.subject.findMany({
        where: { id: { in: subjectIdsToValidate } },
        select: { id: true, name: true },
      });
      subjectNameById = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
      const found = new Set(subjects.map((s) => s.id));
      const missing = subjectIdsToValidate.filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(`Môn học không tồn tại: ${missing.join(', ')}`);
      }
    }

    // Validate topic if provided
    if (dto.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
      if (!topic) throw new NotFoundException('Chủ đề không tồn tại');
      if (subjectIdsToValidate.length > 0 && !subjectIdsToValidate.includes(topic.subjectId)) {
        throw new BadRequestException('Chủ đề không thuộc môn học đã chọn');
      }
    }

    // Determine generation mode
    const isManual = dto.generationMode === 'MANUAL';

    if (isManual && (!dto.questionIds?.length && !dto.problemIds?.length)) {
      throw new BadRequestException('MANUAL mode yêu cầu questionIds hoặc problemIds');
    }

    if (!isManual && (dto.questionIds?.length || dto.problemIds?.length)) {
      throw new BadRequestException('RANDOM mode không hỗ trợ questionIds/problemIds');
    }

    if (isManual && dto.questionDifficultyDistribution) {
      throw new BadRequestException('MANUAL mode không hỗ trợ questionDifficultyDistribution');
    }

    if (isManual && dto.questionAllocationRules?.length) {
      throw new BadRequestException('MANUAL mode không hỗ trợ questionAllocationRules');
    }

    if (isManual && dto.problemDifficultyDistribution) {
      throw new BadRequestException('MANUAL mode không hỗ trợ problemDifficultyDistribution');
    }

    const isManualQuestions = isManual && dto.questionIds && dto.questionIds.length > 0;
    const isManualProblems = isManual && dto.problemIds && dto.problemIds.length > 0;

    let finalQuestionIds: string[] = [];
    let finalProblemIds: string[] = [];

    if (isManualQuestions) {
      const distinctQuestionIds = [...new Set(dto.questionIds!)];
      if (distinctQuestionIds.length !== dto.questionIds!.length) {
        throw new BadRequestException('Danh sách questionIds bị trùng');
      }

      // Validate all provided question IDs exist and are published
      const foundQuestions = await this.prisma.question.findMany({
        where: {
          id: { in: distinctQuestionIds },
          isPublished: true,
          ...(questionClassificationFilter && {
            classification: questionClassificationFilter,
          }),
        },
        select: { id: true },
      });
      const foundIds = new Set(foundQuestions.map((q) => q.id));
      const missing = distinctQuestionIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Các câu hỏi không tồn tại hoặc chưa được xuất bản: ${missing.join(', ')}`,
        );
      }
      finalQuestionIds = distinctQuestionIds;
    } else if (dto.questionCount > 0) {
      if (dto.questionAllocationRules?.length) {
        finalQuestionIds = await this.pickRandomQuestionIdsBySubjectRules(
          dto.questionAllocationRules,
          {
            topicId: dto.topicId || undefined,
            defaultDifficulty: (dto.difficulty as Difficulty) || undefined,
            classification: questionClassificationFilter,
            subjectNameById,
          },
          allocationPolicy,
        );
      } else {
      const useQuestionDetailDistribution = Boolean(dto.questionDifficultyDistribution);
      const questionFilter = {
        classification: questionClassificationFilter,
        subjectIds: selectedSubjectIds.length > 0 ? selectedSubjectIds : undefined,
        topicId: dto.topicId || undefined,
        difficulty: useQuestionDetailDistribution
          ? undefined
          : ((dto.difficulty as Difficulty) || undefined),
      };

        if (dto.questionDifficultyDistribution) {
          finalQuestionIds = await this.pickRandomQuestionIdsByDifficultyDistribution(
            questionFilter,
            dto.questionDifficultyDistribution,
            allocationPolicy,
          );
        } else {
          finalQuestionIds = await this.pickRandomQuestionIdsBySql(questionFilter, dto.questionCount);
        }
      }

      if (finalQuestionIds.length < dto.questionCount) {
        if (!isFlexibleAllocation) {
          throw new BadRequestException(
            `Không đủ câu hỏi. Yêu cầu ${dto.questionCount}, hiện có ${finalQuestionIds.length} câu hỏi phù hợp.`,
          );
        }
        this.logger.warn(
          `Tạo đề thi ở chế độ FLEXIBLE: số câu hỏi thực tế ${finalQuestionIds.length}/${dto.questionCount}`,
        );
      }
    }

    if (isManualProblems) {
      const distinctProblemIds = [...new Set(dto.problemIds!)];
      if (distinctProblemIds.length !== dto.problemIds!.length) {
        throw new BadRequestException('Danh sách problemIds bị trùng');
      }

      // Validate all provided problem IDs exist and are published
      const foundProblems = await this.prisma.problem.findMany({
        where: { id: { in: distinctProblemIds }, isPublished: true },
        select: { id: true },
      });
      const foundIds = new Set(foundProblems.map((p) => p.id));
      const missing = distinctProblemIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(
          `Các bài code không tồn tại hoặc chưa được xuất bản: ${missing.join(', ')}`,
        );
      }
      finalProblemIds = distinctProblemIds;
    } else if (dto.problemCount > 0) {
      const useProblemDetailDistribution = Boolean(dto.problemDifficultyDistribution);
      const problemFilter = {
        subjectIds:
          dto.includeProblemsRelatedToQuestions && selectedSubjectIds.length > 0
            ? selectedSubjectIds
            : undefined,
        topicId: dto.includeProblemsRelatedToQuestions ? dto.topicId || undefined : undefined,
        difficulty: useProblemDetailDistribution
          ? undefined
          : ((dto.difficulty as Difficulty) || undefined),
      };

      if (dto.problemDifficultyDistribution) {
        finalProblemIds = await this.pickRandomProblemIdsByDifficultyDistribution(
          problemFilter,
          dto.problemDifficultyDistribution,
          allocationPolicy,
        );
      } else {
        finalProblemIds = await this.pickRandomProblemIdsBySql(problemFilter, dto.problemCount);
      }

      if (finalProblemIds.length < dto.problemCount) {
        if (!isFlexibleAllocation) {
          throw new BadRequestException(
            `Không đủ bài code. Yêu cầu ${dto.problemCount}, hiện có ${finalProblemIds.length} bài phù hợp.`,
          );
        }
        this.logger.warn(
          `Tạo đề thi ở chế độ FLEXIBLE: số bài code thực tế ${finalProblemIds.length}/${dto.problemCount}`,
        );
      }
    }

    const effectiveQuestionCount = finalQuestionIds.length;
    const effectiveProblemCount = finalProblemIds.length;
    const publication = this.buildPublicationState({
      visibility: dto.visibility,
      publishAt: dto.publishAt || null,
      publishNow: dto.publishNow,
    });

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
          visibility: publication.visibility,
          allowStudentReviewResults: dto.allowStudentReviewResults,
          publishAt: publication.publishAt,
          publishedAt: publication.publishedAt,
          isPublished: publication.isPublished,
          subjectId:
            selectedSubjectIds.length === 1
              ? selectedSubjectIds[0]
              : dto.subjectId || null,
          topicId: dto.topicId || null,
          creatorId,
          type: (dto.type as any) || 'EXAM',
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
    await this.syncScheduledExamPublication();

    const {
      page,
      limit,
      subjectId,
      topicId,
      difficulty,
      visibility,
      search,
      minDuration,
      maxDuration,
      minQuestionCount,
      maxQuestionCount,
      isPublished,
      sortBy,
      sortOrder,
    } =
      query;
    const skip = (page - 1) * limit;

    const where: Prisma.ExamWhereInput = {};

    // Students only see published exams
    if (userRole === 'STUDENT') {
      where.AND = [
        { type: 'EXAM' },
        { visibility: 'PUBLIC' },
        {
          OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }],
        },
      ];
    } else if (isPublished !== undefined) {
      where.isPublished = isPublished;
    }

    if (subjectId) where.subjectId = subjectId;
    if (topicId) where.topicId = topicId;
    if (difficulty) where.difficulty = difficulty as Difficulty;
    if (visibility && userRole !== 'STUDENT') where.visibility = visibility;
    if (minDuration !== undefined || maxDuration !== undefined) {
      where.duration = {
        ...(minDuration !== undefined && { gte: minDuration }),
        ...(maxDuration !== undefined && { lte: maxDuration }),
      };
    }
    if (minQuestionCount !== undefined || maxQuestionCount !== undefined) {
      where.questionCount = {
        ...(minQuestionCount !== undefined && { gte: minQuestionCount }),
        ...(maxQuestionCount !== undefined && { lte: maxQuestionCount }),
      };
    }
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
          type: e.type,
          questionCount: e.questionCount,
          problemCount: e.problemCount,
          duration: e.duration,
          difficulty: e.difficulty,
          isPublished: e.isPublished,
          visibility: e.visibility,
          publishAt: e.publishAt,
          publishedAt: e.publishedAt,
          allowStudentReviewResults: e.allowStudentReviewResults,
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
    await this.syncScheduledExamPublication();

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

    if (!this.isExamPubliclyAvailable(exam) && userRole === 'STUDENT') {
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
    await this.assertExamManagementPermission(userId, userRole, 'cập nhật đề thi');

    const exam = await this.prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Đề thi không tồn tại');

    const publicationUpdate = this.resolvePublicationUpdate(dto, exam);

    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.duration && { duration: dto.duration }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        ...(publicationUpdate || {}),
        ...(dto.allowStudentReviewResults !== undefined && {
          allowStudentReviewResults: dto.allowStudentReviewResults,
        }),
        ...(dto.shuffleQuestions !== undefined && { shuffleQuestions: dto.shuffleQuestions }),
        ...(dto.shuffleChoices !== undefined && { shuffleChoices: dto.shuffleChoices }),
        ...(dto.type !== undefined && { type: dto.type as any }),
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
    await this.assertExamManagementPermission(userId, userRole, 'xóa đề thi');

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
    * Requires booth check-in only for EXAM sessions.
   */
  async startSession(examId: string, userId: string): Promise<ShuffledSessionDto> {
    await this.syncScheduledExamPublication();

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, type: true },
    });
    if (!exam) throw new NotFoundException('Đề thi không tồn tại');

    let activeBooking: Awaited<ReturnType<BookingsService['findActiveCheckedInBooking']>> | null =
      null;

    if (exam.type === 'EXAM') {
      activeBooking = await this.bookingsService.requireActiveCheckedInBooking(userId, 'EXAM');
    } else {
      activeBooking = await this.bookingsService.findActiveCheckedInBooking(userId, 'PRACTICE');
    }

    if (activeBooking && activeBooking.type !== exam.type) {
      const examTypeLabel = exam.type === 'PRACTICE' ? 'luyện tập' : 'thi';
      const bookingTypeLabel = activeBooking.type === 'PRACTICE' ? 'luyện tập' : 'thi';
      throw new ForbiddenException(
        `Đề thi này dành cho nội dung ${examTypeLabel}, nhưng bạn hiện có lịch ${bookingTypeLabel}. Vui lòng chọn đúng loại.`,
      );
    }

    // Check if booking already has an active exam session
    const existingLinkedSession = activeBooking
      ? await this.prisma.examSession.findFirst({
          where: {
            bookingId: activeBooking.id,
            userId,
            status: 'IN_PROGRESS',
          },
          include: { exam: true },
          orderBy: { startedAt: 'desc' },
        })
      : null;

    if (existingLinkedSession) {
      if (this.isSessionExpired(existingLinkedSession, existingLinkedSession.exam.duration)) {
        if (exam.type === 'EXAM') {
          throw new ConflictException('Thời gian làm bài đã hết, không thể tiếp tục');
        }

        await this.prisma.examSession.update({
          where: { id: existingLinkedSession.id },
          data: {
            status: 'SUBMITTED',
            finishedAt: new Date(),
          },
        });
      } else {
        return this.getSessionData(existingLinkedSession.id, userId);
      }
    }

    const fullExam = await this.prisma.exam.findUnique({
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

    if (!fullExam) throw new NotFoundException('Đề thi không tồn tại');
    if (!this.isExamPubliclyAvailable(fullExam)) throw new ForbiddenException('Đề thi chưa được công bố');

    // Check if there's an existing session of this exam for this user
    const existingSession = await this.prisma.examSession.findFirst({
      where: { examId, userId },
      include: { exam: true },
      orderBy: { startedAt: 'desc' },
    });

    if (existingSession) {
      const isCompleted =
        existingSession.status === 'SUBMITTED' || existingSession.status === 'GRADED';

      if (isCompleted) {
        if (exam.type === 'PRACTICE') {
          // PRACTICE exams support re-attempts.
        } else {
          throw new ConflictException('Bạn đã hoàn thành đề thi này rồi');
        }
      } else if (this.isSessionExpired(existingSession, existingSession.exam.duration)) {
        if (exam.type === 'PRACTICE') {
          await this.prisma.examSession.update({
            where: { id: existingSession.id },
            data: {
              status: 'SUBMITTED',
              finishedAt: new Date(),
            },
          });
        } else {
          throw new ConflictException('Thời gian làm bài đã hết, không thể tiếp tục');
        }
      } else {
        // Resume existing in-progress session
        return this.getSessionData(existingSession.id, userId);
      }
    }

    // Generate random seed
    const seed = crypto.randomInt(0, 2147483647);

    // Create new session with expiresAt deadline
    const now = new Date();
    const expiresAt = new Date(now.getTime() + fullExam.duration * 60 * 1000);
    const session = await this.prisma.examSession.create({
      data: {
        examId,
        userId,
        seed,
        expiresAt,
        bookingId: activeBooking?.id ?? null,
        maxScore: fullExam.items.reduce((sum, item) => sum + item.points, 0),
      },
    });

    return this.buildShuffledSession(session, fullExam);
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

    // Check if session has expired
    if (this.isSessionExpired(session, session.exam.duration)) {
      throw new ConflictException('Thời gian làm bài đã hết');
    }

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
        sourceCode: dto.sourceCode || null,
        language: dto.language || null,
        languageVersion: dto.languageVersion || null,
      },
      update: {
        selectedChoiceIds: dto.selectedChoiceIds || [],
        textAnswer: dto.textAnswer || null,
        submissionId: dto.submissionId || null,
        sourceCode: dto.sourceCode || null,
        language: dto.language || null,
        languageVersion: dto.languageVersion || null,
      },
    });

    return new SessionAnswerDto({
      id: answer.id,
      examItemId: answer.examItemId,
      selectedChoiceIds: answer.selectedChoiceIds,
      textAnswer: answer.textAnswer,
      submissionId: answer.submissionId,
      sourceCode: answer.sourceCode,
      language: answer.language,
      languageVersion: answer.languageVersion,
      isCorrect: answer.isCorrect,
      score: answer.score,
    });
  }

  /**
   * Submit a session: auto-score MC + auto-grade coding problems via code execution.
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
                problem: { include: { testCases: { orderBy: { order: 'asc' } } } },
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

    // Check if session has expired
    if (this.isSessionExpired(session, session.exam.duration)) {
      throw new ConflictException('Bạn đã nộp quá hạn giờ quy định');
    }

    // Auto-score MC questions + auto-grade coding problems
    let totalScore = 0;
    const failedAutoGradeItemIds = new Set<string>();
    const answerUpdates: {
      id: string;
      isCorrect: boolean;
      score: number;
      submissionId?: string;
    }[] = [];

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

      // Auto-grade PROBLEM items with source code
      if (item.section === 'PROBLEM' && item.problem && answer.sourceCode && answer.language) {
        try {
          this.logger.log(
            `Auto-grading problem "${item.problem.title}" for session ${sessionId}, answer ${answer.id}`,
          );

          // Create a Submission record via SubmissionsService (runs code execution)
          const submission = await this.submissionsService.create(userId, {
            language: answer.language,
            version: answer.languageVersion || '*',
            sourceCode: answer.sourceCode,
            problemId: item.problem.id,
          });

          const isAccepted = submission.status === 'ACCEPTED';
          const passRate =
            submission.totalTestCases > 0
              ? submission.passedTestCases / submission.totalTestCases
              : 0;
          // Proportional scoring: passedTestCases / totalTestCases × points
          const itemScore = Math.round(passRate * item.points * 100) / 100;

          totalScore += itemScore;

          answerUpdates.push({
            id: answer.id,
            isCorrect: isAccepted,
            score: itemScore,
            submissionId: submission.id,
          });

          this.logger.log(
            `Auto-graded answer ${answer.id} with submission ${submission.id}: ${submission.status} (${submission.passedTestCases}/${submission.totalTestCases})`,
          );
        } catch (error) {
          failedAutoGradeItemIds.add(answer.id);
          this.logger.error(
            `Failed to auto-grade problem "${item.problem.title}" for session ${sessionId}, answer ${answer.id}: ${(error as Error).message}`,
          );
          // Leave as null (pending manual grading) if execution fails
        }
      }
    }

    if (failedAutoGradeItemIds.size > 0) {
      this.logger.warn(
        `Session ${sessionId} has ${failedAutoGradeItemIds.size} coding answer(s) pending manual grading due to execution failures`,
      );
    }

    // Update all answers and session in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const update of answerUpdates) {
        await tx.examSessionAnswer.update({
          where: { id: update.id },
          data: {
            isCorrect: update.isCorrect,
            score: update.score,
            ...(update.submissionId ? { submissionId: update.submissionId } : {}),
          },
        });
      }

      // Check if all items are graded
      const allAnswers = await tx.examSessionAnswer.findMany({
        where: { sessionId },
      });
      const allGraded = allAnswers.every((a) => a.isCorrect !== null);

      await tx.examSession.update({
        where: { id: sessionId },
        data: {
          status: allGraded ? 'GRADED' : 'SUBMITTED',
          finishedAt: new Date(),
          score: totalScore,
        },
      });
    });

    await this.syncExamCompletionPoints(sessionId, session.userId, totalScore, session.maxScore);

    return this.getSessionResult(sessionId, userId, 'STUDENT');
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
                question: {
                  include: {
                    choices: {
                      orderBy: { order: 'asc' },
                    },
                  },
                },
                problem: true,
              },
            },
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');

    // Lecturers/admin can review all sessions. Students can review only their own
    // sessions and may receive summary-only data when exam review is disabled.
    const isOwner = session.userId === userId;
    const role = userRole || (isOwner ? 'STUDENT' : undefined);
    const canViewAsLecturer = role === 'ADMIN' || role === 'LECTURER';

    if (!canViewAsLecturer && !(role === 'STUDENT' && isOwner)) {
      throw new ForbiddenException('Bạn không có quyền xem kết quả phiên thi này');
    }

    const canViewItemDetails = canViewAsLecturer || session.exam.allowStudentReviewResults;
    const detailMessage = canViewItemDetails
      ? null
      : 'Đề thi này không cho phép sinh viên xem chi tiết từng câu.';

    const correctItems = session.answers.filter((i) => i.isCorrect === true).length;
    const pendingItems = session.answers.filter((i) => i.isCorrect === null).length;

    const items: SessionResultItemDto[] = [];

    if (canViewItemDetails) {
      const submissionIds = session.answers
        .map((answer) => answer.submissionId)
        .filter((id): id is string => Boolean(id));

      const submissions =
        submissionIds.length > 0
          ? await this.prisma.submission.findMany({
              where: { id: { in: submissionIds } },
              select: {
                id: true,
                status: true,
                passedTestCases: true,
                failedTestCases: true,
                totalTestCases: true,
                executionTime: true,
                compileOutput: true,
                errorMessage: true,
                testCaseResults: true,
              },
            })
          : [];

      const submissionMap = new Map(submissions.map((submission) => [submission.id, submission]));

      for (const answer of session.answers) {
        const section = answer.examItem.section as 'QUESTION' | 'PROBLEM';
        const selectedChoiceIds = answer.selectedChoiceIds ?? [];
        const question = answer.examItem.question;

        const item = new SessionResultItemDto({
          examItemId: answer.examItemId,
          section,
          points: answer.examItem.points,
          isCorrect: answer.isCorrect,
          score: answer.score,
          questionContent: question?.content,
          problemTitle: answer.examItem.problem?.title,
          selectedChoiceIds,
          textAnswer: answer.textAnswer,
        });

        if (section === 'QUESTION' && question) {
          item.questionType = question.questionType;
          item.questionExplanation = question.explanation;
          item.correctAnswer =
            question.questionType === 'SHORT_ANSWER' ? question.correctAnswer : null;
          item.choices = question.choices.map(
            (choice) =>
              new SessionResultChoiceDto({
                id: choice.id,
                content: choice.content,
                order: choice.order,
                isSelected: selectedChoiceIds.includes(choice.id),
                isCorrect: choice.isCorrect,
              }),
          );
        }

        if (section === 'PROBLEM' && answer.submissionId) {
          const submission = submissionMap.get(answer.submissionId);

          if (submission) {
            const rawTestCaseResults = submission.testCaseResults as unknown;
            const testCaseResults = Array.isArray(rawTestCaseResults)
              ? (rawTestCaseResults as TestCaseResultJson[]).map(
                  (tc) =>
                    new SessionResultTestCaseDto({
                      testCaseId: tc.testCaseId,
                      input: tc.input,
                      expectedOutput: tc.expectedOutput,
                      actualOutput: tc.actualOutput,
                      stdout: tc.stdout,
                      stderr: tc.stderr,
                      isCorrect: tc.isCorrect,
                      isHidden: tc.isHidden,
                      isSample: tc.isSample,
                      order: tc.order,
                      executionTime: tc.executionTime,
                      passed: tc.passed,
                      message: tc.message,
                    }),
                )
              : null;

            item.submission = new SessionResultSubmissionDto({
              submissionId: submission.id,
              status: submission.status,
              passedTestCases: submission.passedTestCases,
              failedTestCases: submission.failedTestCases,
              totalTestCases: submission.totalTestCases,
              executionTime: canViewAsLecturer ? submission.executionTime : null,
              compileOutput: canViewAsLecturer ? submission.compileOutput : null,
              errorMessage: canViewAsLecturer ? submission.errorMessage : null,
              testCaseResults: canViewAsLecturer ? testCaseResults : null,
            });
          }
        }

        items.push(item);
      }
    }

    return new SessionResultDto({
      id: session.id,
      examId: session.examId,
      examTitle: session.exam.title,
      status: session.status,
      startedAt: session.startedAt,
      finishedAt: session.finishedAt,
      score: session.score,
      maxScore: session.maxScore,
      totalItems: session.answers.length,
      correctItems,
      pendingItems,
      canViewItemDetails,
      detailMessage,
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
    await this.assertExamManagementPermission(userId, userRole, 'chấm điểm');

    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');
    if (session.status === 'IN_PROGRESS') {
      throw new BadRequestException('Phiên thi chưa được nộp');
    }

    // Update grades in a transaction
    const gradingSummary = await this.prisma.$transaction(async (tx) => {
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

      return { totalScore };
    });

    await this.syncExamCompletionPoints(
      sessionId,
      session.userId,
      gradingSummary.totalScore,
      session.maxScore,
    );

    return this.getSessionResult(sessionId, userId, userRole);
  }

  // ==================== EXAM SESSIONS LIST ====================

  /**
   * List exam sessions for a user (or all sessions for lecturers/admins).
   */
  async findAllSessions(
    userId: string,
    userRole: string,
    query: QueryExamSessionsDto,
  ): Promise<PaginatedExamSessionsDto> {
    const { page, limit, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ExamSessionWhereInput = {};

    // Students only see their own sessions
    if (userRole === 'STUDENT') {
      where.userId = userId;
    } else if (query.studentId) {
      where.userId = query.studentId;
    }

    if (query.examId) {
      where.examId = query.examId;
    }

    if (status) {
      where.status = status;
    }

    const [sessions, total] = await Promise.all([
      this.prisma.examSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          exam: {
            select: {
              id: true,
              title: true,
              questionCount: true,
              problemCount: true,
            },
          },
          answers: {
            select: {
              isCorrect: true,
            },
          },
        },
      }),
      this.prisma.examSession.count({ where }),
    ]);

    const data = sessions.map((s) => {
      const totalItems = s.answers.length;
      const correctItems = s.answers.filter((a) => a.isCorrect === true).length;
      const pendingItems = s.answers.filter((a) => a.isCorrect === null).length;

      return new ExamSessionListItemDto({
        id: s.id,
        examId: s.exam.id,
        examTitle: s.exam.title,
        status: s.status,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        score: s.score,
        maxScore: s.maxScore,
        totalItems,
        correctItems,
        pendingItems,
        questionCount: s.exam.questionCount,
        problemCount: s.exam.problemCount,
      });
    });

    return new PaginatedExamSessionsDto({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  // ==================== HELPER METHODS ====================

  private buildPublicationState(input: {
    visibility?: ExamVisibility;
    publishAt?: Date | null;
    publishNow?: boolean;
  }): {
    visibility: ExamVisibility;
    publishAt: Date | null;
    publishedAt: Date | null;
    isPublished: boolean;
  } {
    const now = new Date();
    const visibility = input.visibility || 'PRIVATE';
    const publishAt = input.publishAt || null;

    if (visibility === 'PRIVATE') {
      return {
        visibility: 'PRIVATE',
        publishAt: null,
        publishedAt: null,
        isPublished: false,
      };
    }

    if (input.publishNow) {
      return {
        visibility: 'PUBLIC',
        publishAt: null,
        publishedAt: now,
        isPublished: true,
      };
    }

    if (publishAt && publishAt.getTime() > now.getTime()) {
      return {
        visibility: 'PUBLIC',
        publishAt,
        publishedAt: null,
        isPublished: false,
      };
    }

    return {
      visibility: 'PUBLIC',
      publishAt,
      publishedAt: now,
      isPublished: true,
    };
  }

  private resolvePublicationUpdate(
    dto: UpdateExamDto,
    exam: {
      visibility: ExamVisibility;
      publishAt: Date | null;
      publishedAt: Date | null;
      isPublished: boolean;
    },
  ):
    | {
        visibility: ExamVisibility;
        publishAt: Date | null;
        publishedAt: Date | null;
        isPublished: boolean;
      }
    | undefined {
    const hasPublicationInput =
      dto.visibility !== undefined ||
      dto.publishAt !== undefined ||
      dto.publishNow !== undefined ||
      dto.isPublished !== undefined;

    if (!hasPublicationInput) {
      return undefined;
    }

    const visibilityFromLegacy =
      dto.isPublished === undefined ? undefined : dto.isPublished ? 'PUBLIC' : 'PRIVATE';
    const targetVisibility = dto.visibility || visibilityFromLegacy || exam.visibility;
    const targetPublishAt = dto.publishAt === undefined ? exam.publishAt : dto.publishAt;
    const publishNowFromLegacy =
      dto.isPublished === true && dto.publishAt === undefined && dto.publishNow === undefined;
    const publishNow = dto.publishNow || publishNowFromLegacy;

    const next = this.buildPublicationState({
      visibility: targetVisibility,
      publishAt: targetPublishAt,
      publishNow,
    });

    if (next.visibility === 'PUBLIC' && next.isPublished && !exam.publishedAt && !next.publishedAt) {
      next.publishedAt = new Date();
    }

    return next;
  }

  private async syncScheduledExamPublication(): Promise<void> {
    const now = new Date();
    await this.prisma.exam.updateMany({
      where: {
        visibility: 'PUBLIC',
        publishAt: { lte: now },
        isPublished: false,
      },
      data: {
        isPublished: true,
        publishedAt: now,
      },
    });
  }

  private isExamPubliclyAvailable(exam: {
    visibility: ExamVisibility;
    publishAt: Date | null;
  }): boolean {
    if (exam.visibility !== 'PUBLIC') {
      return false;
    }

    if (!exam.publishAt) {
      return true;
    }

    return exam.publishAt.getTime() <= Date.now();
  }

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

  private buildQuestionFilterWhereSql(filter: {
    classification?: QuestionClassification;
    subjectIds?: string[];
    topicId?: string;
    difficulty?: Difficulty;
    excludeIds?: string[];
  }): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`q."isPublished" = true`];

    if (filter.classification) {
      conditions.push(
        Prisma.sql`q."classification" = ${filter.classification}::"QuestionClassification"`,
      );
    }

    if (filter.subjectIds?.length) {
      conditions.push(Prisma.sql`q."subjectId" IN (${Prisma.join(filter.subjectIds)})`);
    }
    if (filter.topicId) {
      conditions.push(Prisma.sql`q."topicId" = ${filter.topicId}`);
    }
    if (filter.difficulty) {
      conditions.push(Prisma.sql`q."difficulty" = ${filter.difficulty}::"Difficulty"`);
    }
    if (filter.excludeIds?.length) {
      conditions.push(Prisma.sql`q.id NOT IN (${Prisma.join(filter.excludeIds)})`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private async pickRandomQuestionIdsBySql(
    filter: {
      classification?: QuestionClassification;
      subjectIds?: string[];
      topicId?: string;
      difficulty?: Difficulty;
      excludeIds?: string[];
    },
    count: number,
  ): Promise<string[]> {
    if (count <= 0) return [];

    const whereSql = this.buildQuestionFilterWhereSql(filter);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT q.id
      FROM "Question" q
      WHERE ${whereSql}
      ORDER BY random()
      LIMIT ${count}
    `;

    return rows.map((r) => r.id);
  }

  private async pickRandomQuestionIdsByDifficultyDistribution(
    filter: {
      classification?: QuestionClassification;
      subjectIds?: string[];
      topicId?: string;
      difficulty?: Difficulty;
    },
    distribution: { easy: number; medium: number; hard: number },
    allocationPolicy: AllocationPolicy,
  ): Promise<string[]> {
    const totalRequested = distribution.easy + distribution.medium + distribution.hard;
    if (totalRequested <= 0) return [];

    const where: Prisma.QuestionWhereInput = {
      isPublished: true,
      ...(filter.classification && { classification: filter.classification }),
    };
    if (filter.subjectIds?.length) where.subjectId = { in: filter.subjectIds };
    if (filter.topicId) where.topicId = filter.topicId;

    const grouped = await this.prisma.question.groupBy({
      by: ['difficulty'],
      where,
      _count: { _all: true },
    });

    const available: Record<Difficulty, number> = {
      EASY: 0,
      MEDIUM: 0,
      HARD: 0,
    };
    for (const row of grouped) {
      available[row.difficulty as Difficulty] = row._count._all;
    }

    const strictMode = allocationPolicy !== 'FLEXIBLE';
    if (strictMode) {
      if (distribution.easy > available.EASY) {
        throw new BadRequestException(
          `Không đủ câu EASY. Yêu cầu ${distribution.easy}, hiện có ${available.EASY}.`,
        );
      }
      if (distribution.medium > available.MEDIUM) {
        throw new BadRequestException(
          `Không đủ câu MEDIUM. Yêu cầu ${distribution.medium}, hiện có ${available.MEDIUM}.`,
        );
      }
      if (distribution.hard > available.HARD) {
        throw new BadRequestException(
          `Không đủ câu HARD. Yêu cầu ${distribution.hard}, hiện có ${available.HARD}.`,
        );
      }
    }

    const effectiveDistribution = strictMode
      ? distribution
      : {
          easy: Math.min(distribution.easy, available.EASY),
          medium: Math.min(distribution.medium, available.MEDIUM),
          hard: Math.min(distribution.hard, available.HARD),
        };

    const whereSql = this.buildQuestionFilterWhereSql(filter);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH ranked AS (
        SELECT
          q.id,
          q."difficulty",
          ROW_NUMBER() OVER (PARTITION BY q."difficulty" ORDER BY random()) AS rn
        FROM "Question" q
        WHERE ${whereSql}
      )
      SELECT id
      FROM ranked
      WHERE
        ("difficulty" = 'EASY'::"Difficulty" AND rn <= ${effectiveDistribution.easy})
        OR ("difficulty" = 'MEDIUM'::"Difficulty" AND rn <= ${effectiveDistribution.medium})
        OR ("difficulty" = 'HARD'::"Difficulty" AND rn <= ${effectiveDistribution.hard})
    `;

    let selectedIds = rows.map((r) => r.id);

    if (!strictMode && selectedIds.length < totalRequested) {
      const missing = totalRequested - selectedIds.length;
      const fallbackIds = await this.pickRandomQuestionIdsBySql(
        {
          classification: filter.classification,
          subjectIds: filter.subjectIds,
          topicId: filter.topicId,
          excludeIds: selectedIds,
        },
        missing,
      );
      selectedIds = [...selectedIds, ...fallbackIds];
      this.logger.warn(
        `Phân bổ câu hỏi FLEXIBLE: lấy theo bucket ${rows.length}/${totalRequested}, bù thêm ${fallbackIds.length}`,
      );
    }

    return selectedIds;
  }

  private async pickRandomQuestionIdsBySubjectRules(
    rules: { subjectId: string; difficulty?: Difficulty | null; count: number }[],
    options: {
      topicId?: string;
      defaultDifficulty?: Difficulty;
      classification?: QuestionClassification;
      subjectNameById: Record<string, string>;
    },
    allocationPolicy: AllocationPolicy,
  ): Promise<string[]> {
    const strictMode = allocationPolicy !== 'FLEXIBLE';
    const totalRequested = rules.reduce((sum, r) => sum + r.count, 0);
    const selectedIds: string[] = [];

    for (const rule of rules) {
      const questionFilter = {
        classification: options.classification,
        subjectIds: [rule.subjectId],
        topicId: options.topicId,
        difficulty: (rule.difficulty as Difficulty | undefined) || options.defaultDifficulty,
        excludeIds: selectedIds,
      };

      const picked = await this.pickRandomQuestionIdsBySql(questionFilter, rule.count);
      const subjectLabel = options.subjectNameById[rule.subjectId] || rule.subjectId;
      const difficultyLabel = rule.difficulty ? ` (${rule.difficulty})` : '';

      if (picked.length < rule.count && strictMode) {
        throw new BadRequestException(
          `Không đủ câu hỏi cho môn ${subjectLabel}${difficultyLabel}. Yêu cầu ${rule.count}, hiện có ${picked.length}.`,
        );
      }

      if (picked.length < rule.count && !strictMode) {
        const missing = rule.count - picked.length;
        const fallback = await this.pickRandomQuestionIdsBySql(
          {
            classification: options.classification,
            subjectIds: [rule.subjectId],
            topicId: options.topicId,
            excludeIds: [...selectedIds, ...picked],
          },
          missing,
        );
        selectedIds.push(...picked, ...fallback);
        this.logger.warn(
          `FLEXIBLE subject rule cho môn ${subjectLabel}${difficultyLabel}: bucket đủ ${picked.length}/${rule.count}, bù thêm ${fallback.length}`,
        );
        continue;
      }

      selectedIds.push(...picked);
    }

    if (!strictMode && selectedIds.length < totalRequested) {
      this.logger.warn(
        `questionAllocationRules FLEXIBLE chưa đủ tổng số lượng: ${selectedIds.length}/${totalRequested}`,
      );
    }

    return selectedIds;
  }

  private buildProblemFilterWhereSql(filter: {
    subjectIds?: string[];
    topicId?: string;
    difficulty?: Difficulty;
    excludeIds?: string[];
  }): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`p."isPublished" = true`];

    if (filter.subjectIds?.length) {
      conditions.push(Prisma.sql`p."subjectId" IN (${Prisma.join(filter.subjectIds)})`);
    }
    if (filter.topicId) {
      conditions.push(Prisma.sql`p."topicId" = ${filter.topicId}`);
    }
    if (filter.difficulty) {
      conditions.push(Prisma.sql`p."difficulty" = ${filter.difficulty}::"Difficulty"`);
    }
    if (filter.excludeIds?.length) {
      conditions.push(Prisma.sql`p.id NOT IN (${Prisma.join(filter.excludeIds)})`);
    }

    return Prisma.join(conditions, ' AND ');
  }

  private async pickRandomProblemIdsBySql(
    filter: {
      subjectIds?: string[];
      topicId?: string;
      difficulty?: Difficulty;
      excludeIds?: string[];
    },
    count: number,
  ): Promise<string[]> {
    if (count <= 0) return [];

    const whereSql = this.buildProblemFilterWhereSql(filter);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id
      FROM "Problem" p
      WHERE ${whereSql}
      ORDER BY random()
      LIMIT ${count}
    `;

    return rows.map((r) => r.id);
  }

  private async pickRandomProblemIdsByDifficultyDistribution(
    filter: {
      subjectIds?: string[];
      topicId?: string;
      difficulty?: Difficulty;
    },
    distribution: { easy: number; medium: number; hard: number },
    allocationPolicy: AllocationPolicy,
  ): Promise<string[]> {
    const totalRequested = distribution.easy + distribution.medium + distribution.hard;
    if (totalRequested <= 0) return [];

    const where: Prisma.ProblemWhereInput = { isPublished: true };
    if (filter.subjectIds?.length) where.subjectId = { in: filter.subjectIds };
    if (filter.topicId) where.topicId = filter.topicId;

    const grouped = await this.prisma.problem.groupBy({
      by: ['difficulty'],
      where,
      _count: { _all: true },
    });

    const available: Record<Difficulty, number> = {
      EASY: 0,
      MEDIUM: 0,
      HARD: 0,
    };
    for (const row of grouped) {
      available[row.difficulty as Difficulty] = row._count._all;
    }

    const strictMode = allocationPolicy !== 'FLEXIBLE';
    if (strictMode) {
      if (distribution.easy > available.EASY) {
        throw new BadRequestException(
          `Không đủ bài code EASY. Yêu cầu ${distribution.easy}, hiện có ${available.EASY}.`,
        );
      }
      if (distribution.medium > available.MEDIUM) {
        throw new BadRequestException(
          `Không đủ bài code MEDIUM. Yêu cầu ${distribution.medium}, hiện có ${available.MEDIUM}.`,
        );
      }
      if (distribution.hard > available.HARD) {
        throw new BadRequestException(
          `Không đủ bài code HARD. Yêu cầu ${distribution.hard}, hiện có ${available.HARD}.`,
        );
      }
    }

    const effectiveDistribution = strictMode
      ? distribution
      : {
          easy: Math.min(distribution.easy, available.EASY),
          medium: Math.min(distribution.medium, available.MEDIUM),
          hard: Math.min(distribution.hard, available.HARD),
        };

    const whereSql = this.buildProblemFilterWhereSql(filter);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      WITH ranked AS (
        SELECT
          p.id,
          p."difficulty",
          ROW_NUMBER() OVER (PARTITION BY p."difficulty" ORDER BY random()) AS rn
        FROM "Problem" p
        WHERE ${whereSql}
      )
      SELECT id
      FROM ranked
      WHERE
        ("difficulty" = 'EASY'::"Difficulty" AND rn <= ${effectiveDistribution.easy})
        OR ("difficulty" = 'MEDIUM'::"Difficulty" AND rn <= ${effectiveDistribution.medium})
        OR ("difficulty" = 'HARD'::"Difficulty" AND rn <= ${effectiveDistribution.hard})
    `;

    let selectedIds = rows.map((r) => r.id);

    if (!strictMode && selectedIds.length < totalRequested) {
      const missing = totalRequested - selectedIds.length;
      const fallbackIds = await this.pickRandomProblemIdsBySql(
        {
          subjectIds: filter.subjectIds,
          topicId: filter.topicId,
          excludeIds: selectedIds,
        },
        missing,
      );
      selectedIds = [...selectedIds, ...fallbackIds];
      this.logger.warn(
        `Phân bổ bài code FLEXIBLE: lấy theo bucket ${rows.length}/${totalRequested}, bù thêm ${fallbackIds.length}`,
      );
    }

    return selectedIds;
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
          imageUrl: item.question.imageUrl ?? null,
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
          sourceCode: a.sourceCode,
          language: a.language,
          languageVersion: a.languageVersion,
          isCorrect: a.isCorrect,
          score: a.score,
        }),
    );

    return new ShuffledSessionDto({
      id: session.id,
      examId: exam.id,
      examType: exam.type,
      proctoringEnabled: exam.type === 'EXAM',
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
                imageUrl: item.question.imageUrl ?? null,
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
      type: exam.type,
      questionCount: exam.questionCount,
      problemCount: exam.problemCount,
      duration: exam.duration,
      difficulty: exam.difficulty,
      includeProblemsRelatedToQuestions: exam.includeProblemsRelatedToQuestions,
      isPublished: exam.isPublished,
      visibility: exam.visibility,
      publishAt: exam.publishAt,
      publishedAt: exam.publishedAt,
      allowStudentReviewResults: exam.allowStudentReviewResults,
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
