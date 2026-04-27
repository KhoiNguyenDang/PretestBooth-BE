import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExecutionService } from '../execution/execution.service';
import type { CreateSubmissionDto, QuerySubmissionsDto } from './dto/submission.dto';
import type { QueryUnifiedSubmissionsDto } from './dto/unified-submission.dto';
import type {
  QuerySubmissionTestGroupsDto,
  QuerySubmissionTestMembersDto,
} from './dto/test-submission.dto';
import {
  SubmissionResponseDto,
  SubmissionListItemDto,
  PaginatedSubmissionsDto,
  SubmissionStatsDto,
  type TestCaseResultJson,
} from './dto/submission-response.dto';
import type { Prisma, SubmissionStatus } from '@prisma/client';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionService: ExecutionService,
  ) {}

  /**
   * Create a new submission and execute against test cases
   */
  async create(userId: string, dto: CreateSubmissionDto): Promise<SubmissionResponseDto> {
    // Verify problem exists
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: { testCases: { orderBy: { order: 'asc' } } },
    });

    if (!problem) {
      throw new NotFoundException('Problem not found');
    }

    // Create initial submission record
    const submission = await this.prisma.submission.create({
      data: {
        language: dto.language,
        languageVersion: dto.version === '*' ? null : dto.version,
        sourceCode: dto.sourceCode,
        status: 'PENDING',
        userId,
        problemId: dto.problemId,
      },
    });

    try {
      const normalizedFunctionName =
        typeof problem.functionName === 'string' && problem.functionName.trim().length > 0
          ? problem.functionName.trim()
          : 'solution';

      // Execute code against test cases
      const result = await this.executionService.executeWithTestCases({
        language: dto.language,
        version: dto.version,
        source: dto.sourceCode,
        functionName: normalizedFunctionName,
        problemId: dto.problemId,
      });

      // Map status
      const status = this.mapStatus(result.status);

      // Prepare test case results for storage
      const testCaseResults: TestCaseResultJson[] = result.testCaseResults.map((tc) => ({
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
        message: tc.message || '',
      }));

      // Update submission with results
      const updatedSubmission = await this.prisma.submission.update({
        where: { id: submission.id },
        data: {
          status,
          languageVersion: result.version,
          totalTestCases: result.totalTestCases,
          passedTestCases: result.passedTestCases,
          failedTestCases: result.failedTestCases,
          executionTime: result.totalExecutionTime,
          networkTime: result.totalNetworkTime,
          totalTime: result.totalTime,
          compileOutput: result.compileOutput || null,
          testCaseResults: testCaseResults as unknown as Prisma.InputJsonValue,
        },
        include: {
          problem: {
            select: { id: true, title: true, slug: true, difficulty: true },
          },
        },
      });

      // Update problem stats if accepted
      if (status === 'ACCEPTED') {
        // Check if this is user's first accepted submission for this problem
        const previousAccepted = await this.prisma.submission.count({
          where: {
            userId,
            problemId: dto.problemId,
            status: 'ACCEPTED',
            id: { not: submission.id },
          },
        });

        await this.prisma.problem.update({
          where: { id: dto.problemId },
          data: {
            totalSubmissions: { increment: 1 },
            acceptedSubmissions: previousAccepted === 0 ? { increment: 1 } : undefined,
          },
        });
      } else {
        await this.prisma.problem.update({
          where: { id: dto.problemId },
          data: { totalSubmissions: { increment: 1 } },
        });
      }

      return new SubmissionResponseDto({
        ...updatedSubmission,
        testCaseResults: testCaseResults,
        problem: updatedSubmission.problem,
      });
    } catch (error) {
      // Update submission with error
      await this.prisma.submission.update({
        where: { id: submission.id },
        data: {
          status: 'RUNTIME_ERROR',
          errorMessage: (error as Error).message,
        },
      });

      throw error;
    }
  }

  async findSubmissionTestGroups(
    userId: string,
    userRole: string,
    query: QuerySubmissionTestGroupsDto,
  ) {
    const { page, limit, type, keyword, sortOrder } = query;
    const normalizedKeyword = keyword.trim().toLowerCase();

    const unifiedGroups: Array<{
      type: 'PROBLEM' | 'EXAM';
      examType: 'PRACTICE' | 'EXAM' | null;
      entityId: string;
      title: string;
      slug: string | null;
      difficulty: string | null;
      questionCount: number | null;
      problemCount: number | null;
      totalSubmissions: number;
      totalSubmitters: number;
      passedCount: number;
      latestSubmittedAt: Date;
    }> = [];

    if (type === 'ALL' || type === 'PROBLEM') {
      const problemWhere: Prisma.SubmissionWhereInput = {
        ...(userRole === 'STUDENT' ? { userId } : {}),
      };

      const problemSubmissions = await this.prisma.submission.findMany({
        where: problemWhere,
        select: {
          id: true,
          userId: true,
          status: true,
          createdAt: true,
          problemId: true,
          problem: {
            select: {
              id: true,
              title: true,
              slug: true,
              difficulty: true,
            },
          },
        },
      });

      const groupedByProblem = new Map<
        string,
        {
          type: 'PROBLEM';
          examType: null;
          entityId: string;
          title: string;
          slug: string | null;
          difficulty: string | null;
          questionCount: number | null;
          problemCount: number | null;
          totalSubmissions: number;
          submitterIds: Set<string>;
          passedCount: number;
          latestSubmittedAt: Date;
        }
      >();

      for (const submission of problemSubmissions) {
        if (!submission.problemId || !submission.problem) {
          continue;
        }

        const key = submission.problemId;
        const existing = groupedByProblem.get(key);

        if (!existing) {
          groupedByProblem.set(key, {
            type: 'PROBLEM',
            examType: null,
            entityId: key,
            title: submission.problem.title,
            slug: submission.problem.slug,
            difficulty: submission.problem.difficulty,
            questionCount: null,
            problemCount: null,
            totalSubmissions: 1,
            submitterIds: new Set([submission.userId]),
            passedCount: submission.status === 'ACCEPTED' ? 1 : 0,
            latestSubmittedAt: submission.createdAt,
          });
          continue;
        }

        existing.totalSubmissions += 1;
        existing.submitterIds.add(submission.userId);
        if (submission.status === 'ACCEPTED') {
          existing.passedCount += 1;
        }
        if (submission.createdAt > existing.latestSubmittedAt) {
          existing.latestSubmittedAt = submission.createdAt;
        }
      }

      for (const group of groupedByProblem.values()) {
        unifiedGroups.push({
          type: group.type,
          examType: group.examType,
          entityId: group.entityId,
          title: group.title,
          slug: group.slug,
          difficulty: group.difficulty,
          questionCount: group.questionCount,
          problemCount: group.problemCount,
          totalSubmissions: group.totalSubmissions,
          totalSubmitters: group.submitterIds.size,
          passedCount: group.passedCount,
          latestSubmittedAt: group.latestSubmittedAt,
        });
      }
    }

    if (type === 'ALL' || type === 'EXAM') {
      const examWhere: Prisma.ExamSessionWhereInput = {
        ...(userRole === 'STUDENT' ? { userId } : {}),
      };

      const examSessions = await this.prisma.examSession.findMany({
        where: examWhere,
        select: {
          id: true,
          userId: true,
          startedAt: true,
          examId: true,
          passed: true,
          exam: {
            select: {
              id: true,
              title: true,
              type: true,
              questionCount: true,
              problemCount: true,
            },
          },
        },
      });

      const groupedByExam = new Map<
        string,
        {
          type: 'EXAM';
          examType: 'PRACTICE' | 'EXAM';
          entityId: string;
          title: string;
          slug: string | null;
          difficulty: string | null;
          questionCount: number | null;
          problemCount: number | null;
          totalSubmissions: number;
          submitterIds: Set<string>;
          passedCount: number;
          latestSubmittedAt: Date;
        }
      >();

      for (const session of examSessions) {
        if (!session.examId || !session.exam) {
          continue;
        }

        const key = session.examId;
        const existing = groupedByExam.get(key);

        if (!existing) {
          groupedByExam.set(key, {
            type: 'EXAM',
            examType: session.exam.type,
            entityId: key,
            title: session.exam.title,
            slug: null,
            difficulty: null,
            questionCount: session.exam.questionCount,
            problemCount: session.exam.problemCount,
            totalSubmissions: 1,
            submitterIds: new Set([session.userId]),
            passedCount: session.passed === true ? 1 : 0,
            latestSubmittedAt: session.startedAt,
          });
          continue;
        }

        existing.totalSubmissions += 1;
        existing.submitterIds.add(session.userId);
        if (session.passed === true) {
          existing.passedCount += 1;
        }
        if (session.startedAt > existing.latestSubmittedAt) {
          existing.latestSubmittedAt = session.startedAt;
        }
      }

      for (const group of groupedByExam.values()) {
        unifiedGroups.push({
          type: group.type,
          examType: group.examType,
          entityId: group.entityId,
          title: group.title,
          slug: group.slug,
          difficulty: group.difficulty,
          questionCount: group.questionCount,
          problemCount: group.problemCount,
          totalSubmissions: group.totalSubmissions,
          totalSubmitters: group.submitterIds.size,
          passedCount: group.passedCount,
          latestSubmittedAt: group.latestSubmittedAt,
        });
      }
    }

    const keywordFiltered = normalizedKeyword
      ? unifiedGroups.filter((item) => item.title.toLowerCase().includes(normalizedKeyword))
      : unifiedGroups;

    keywordFiltered.sort((a, b) => {
      const aTs = a.latestSubmittedAt.getTime();
      const bTs = b.latestSubmittedAt.getTime();
      return sortOrder === 'desc' ? bTs - aTs : aTs - bTs;
    });

    const total = keywordFiltered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const data = keywordFiltered.slice(start, start + limit).map((item) => ({
      ...item,
      latestSubmittedAt: item.latestSubmittedAt,
    }));

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findSubmissionTestMembers(
    userId: string,
    userRole: string,
    type: string,
    entityId: string,
    query: QuerySubmissionTestMembersDto,
  ) {
    const normalizedType = type.toUpperCase();
    if (normalizedType !== 'PROBLEM' && normalizedType !== 'EXAM') {
      throw new BadRequestException('Type must be PROBLEM or EXAM');
    }

    const { page, limit, sortOrder } = query;

    if (normalizedType === 'PROBLEM') {
      const where: Prisma.SubmissionWhereInput = {
        problemId: entityId,
        ...(userRole === 'STUDENT' ? { userId } : {}),
      };

      const [rows, total] = await Promise.all([
        this.prisma.submission.findMany({
          where,
          orderBy: { createdAt: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            userId: true,
            status: true,
            language: true,
            passedTestCases: true,
            totalTestCases: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                studentCode: true,
              },
            },
            problem: {
              select: {
                id: true,
                title: true,
                slug: true,
                difficulty: true,
              },
            },
          },
        }),
        this.prisma.submission.count({ where }),
      ]);

      const testMeta = rows[0]?.problem;

      return {
        test: {
          type: 'PROBLEM' as const,
          examType: null,
          entityId,
          title: testMeta?.title || 'Unknown Problem',
          slug: testMeta?.slug || null,
          difficulty: testMeta?.difficulty || null,
          questionCount: null,
          problemCount: null,
        },
        data: rows.map((row) => ({
          id: row.id,
          userId: row.userId,
          userName: row.user?.name || null,
          userEmail: row.user?.email || null,
          studentCode: row.user?.studentCode || null,
          status: row.status,
          language: row.language,
          passed: row.status === 'PENDING' ? null : row.status === 'ACCEPTED',
          passedTestCases: row.passedTestCases,
          totalTestCases: row.totalTestCases,
          score: null,
          maxScore: null,
          examType: null,
          submittedAt: row.createdAt,
        })),
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    }

    const examWhere: Prisma.ExamSessionWhereInput = {
      examId: entityId,
      ...(userRole === 'STUDENT' ? { userId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.examSession.findMany({
        where: examWhere,
        orderBy: { startedAt: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          userId: true,
          status: true,
          passed: true,
          score: true,
          maxScore: true,
          startedAt: true,
          finishedAt: true,
          exam: {
            select: {
              id: true,
              title: true,
              type: true,
              questionCount: true,
              problemCount: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              studentCode: true,
            },
          },
        },
      }),
      this.prisma.examSession.count({ where: examWhere }),
    ]);

    const testMeta = rows[0]?.exam;

    return {
      test: {
        type: 'EXAM' as const,
        examType: testMeta?.type ?? null,
        entityId,
        title: testMeta?.title || 'Unknown Exam',
        slug: null,
        difficulty: null,
        questionCount: testMeta?.questionCount ?? null,
        problemCount: testMeta?.problemCount ?? null,
      },
      data: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userName: row.user?.name || null,
        userEmail: row.user?.email || null,
        studentCode: row.user?.studentCode || null,
        status: row.status,
        language: null,
        passed: row.passed,
        passedTestCases: null,
        totalTestCases: null,
        score: row.score,
        maxScore: row.maxScore,
        examType: row.exam?.type ?? null,
        submittedAt: row.finishedAt || row.startedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Get all submissions for a user with pagination and filters
   */
  async findAll(
    userId: string,
    userRole: string,
    query: QuerySubmissionsDto,
  ): Promise<PaginatedSubmissionsDto> {
    const { page, limit, problemId, status, language, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.SubmissionWhereInput = {};

    // Students can only see their own submissions
    if (userRole === 'STUDENT') {
      where.userId = userId;
    }

    if (problemId) {
      where.problemId = problemId;
    }

    if (status) {
      where.status = status;
    }

    if (language) {
      where.language = language;
    }

    const [submissions, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        select: {
          id: true,
          language: true,
          status: true,
          totalTestCases: true,
          passedTestCases: true,
          executionTime: true,
          totalTime: true,
          problemId: true,
          createdAt: true,
          problem: {
            select: { id: true, title: true, slug: true, difficulty: true },
          },
        },
      }),
      this.prisma.submission.count({ where }),
    ]);

    const data = submissions.map(
      (s) =>
        new SubmissionListItemDto({
          ...s,
          problem: s.problem,
        }),
    );

    return new PaginatedSubmissionsDto({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  /**
   * Get a single submission by ID
   */
  async findOne(id: string, userId: string, userRole: string): Promise<SubmissionResponseDto> {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: {
        problem: {
          select: { id: true, title: true, slug: true, difficulty: true },
        },
        user: {
          select: { id: true, email: true, studentCode: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Students can only view their own submissions
    if (userRole === 'STUDENT' && submission.userId !== userId) {
      throw new ForbiddenException('You can only view your own submissions');
    }

    return new SubmissionResponseDto({
      ...submission,
      testCaseResults: submission.testCaseResults as TestCaseResultJson[] | null,
      problem: submission.problem,
      user: submission.user,
    });
  }

  /**
   * Get user's submissions for a specific problem
   */
  async findByProblem(
    problemId: string,
    userId: string,
    userRole: string,
    query: QuerySubmissionsDto,
  ): Promise<PaginatedSubmissionsDto> {
    // Verify problem exists
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      throw new NotFoundException('Problem not found');
    }

    return this.findAll(userId, userRole, { ...query, problemId });
  }

  /**
   * Get submission statistics for a user on a problem
   */
  async getStats(problemId: string, userId: string): Promise<SubmissionStatsDto> {
    const [submissions, acceptedCount, bestSubmission, languagesResult] = await Promise.all([
      this.prisma.submission.count({
        where: { problemId, userId },
      }),
      this.prisma.submission.count({
        where: { problemId, userId, status: 'ACCEPTED' },
      }),
      this.prisma.submission.findFirst({
        where: { problemId, userId, status: 'ACCEPTED' },
        orderBy: { executionTime: 'asc' },
        select: { executionTime: true, createdAt: true },
      }),
      this.prisma.submission.groupBy({
        by: ['language'],
        where: { problemId, userId },
      }),
    ]);

    const lastSubmission = await this.prisma.submission.findFirst({
      where: { problemId, userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return new SubmissionStatsDto({
      totalSubmissions: submissions,
      acceptedSubmissions: acceptedCount,
      bestTime: bestSubmission?.executionTime || null,
      lastSubmissionAt: lastSubmission?.createdAt || null,
      languages: languagesResult.map((l) => l.language),
    });
  }

  /**
   * Get unified list of both coding problem submissions and exam sessions, sorted by date.
   */
  async findAllUnified(userId: string, userRole: string, query: QueryUnifiedSubmissionsDto) {
    const { page, limit, type, sortOrder } = query;

    // Fetch coding submissions
    let problemSubmissions: any[] = [];
    let problemTotal = 0;

    if (type === 'ALL' || type === 'PROBLEM') {
      const where: Prisma.SubmissionWhereInput = {};
      if (userRole === 'STUDENT') {
        where.userId = userId;
      }

      [problemSubmissions, problemTotal] = await Promise.all([
        this.prisma.submission.findMany({
          where,
          orderBy: { createdAt: sortOrder },
          select: {
            id: true,
            language: true,
            status: true,
            totalTestCases: true,
            passedTestCases: true,
            executionTime: true,
            createdAt: true,
            problem: {
              select: { id: true, title: true, slug: true, difficulty: true },
            },
          },
        }),
        this.prisma.submission.count({ where }),
      ]);
    }

    // Fetch exam sessions
    let examSessions: any[] = [];
    let examTotal = 0;

    if (type === 'ALL' || type === 'EXAM') {
      const where: Prisma.ExamSessionWhereInput = {};
      if (userRole === 'STUDENT') {
        where.userId = userId;
      }

      [examSessions, examTotal] = await Promise.all([
        this.prisma.examSession.findMany({
          where,
          orderBy: { startedAt: sortOrder },
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                type: true,
                questionCount: true,
                problemCount: true,
              },
            },
            answers: {
              select: { isCorrect: true },
            },
          },
        }),
        this.prisma.examSession.count({ where }),
      ]);
    }

    // Normalize both into a unified shape
    const unified: any[] = [];

    for (const s of problemSubmissions) {
      unified.push({
        id: s.id,
        type: 'PROBLEM' as const,
        examType: null,
        title: s.problem?.title || 'Unknown Problem',
        slug: s.problem?.slug || null,
        difficulty: s.problem?.difficulty || null,
        status: s.status,
        language: s.language,
        totalTestCases: s.totalTestCases,
        passedTestCases: s.passedTestCases,
        executionTime: s.executionTime,
        score: null,
        maxScore: null,
        totalItems: null,
        correctItems: null,
        pendingItems: null,
        questionCount: null,
        problemCount: null,
        examId: null,
        date: s.createdAt,
      });
    }

    for (const s of examSessions) {
      const totalItems = s.answers.length;
      const correctItems = s.answers.filter((a: any) => a.isCorrect === true).length;
      const pendingItems = s.answers.filter((a: any) => a.isCorrect === null).length;

      unified.push({
        id: s.id,
        type: 'EXAM' as const,
        examType: s.exam?.type ?? null,
        title: s.exam?.title || 'Unknown Exam',
        slug: null,
        difficulty: null,
        status: s.status,
        language: null,
        totalTestCases: null,
        passedTestCases: null,
        executionTime: null,
        score: s.score,
        maxScore: s.maxScore,
        totalItems,
        correctItems,
        pendingItems,
        questionCount: s.exam?.questionCount || 0,
        problemCount: s.exam?.problemCount || 0,
        examId: s.exam?.id || null,
        date: s.startedAt,
      });
    }

    // Sort by date
    unified.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    // Paginate
    const total = unified.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const data = unified.slice(start, start + limit);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Map execution status to submission status
   */
  private mapStatus(status: string): SubmissionStatus {
    const statusMap: Record<string, SubmissionStatus> = {
      ACCEPTED: 'ACCEPTED',
      WRONG_ANSWER: 'WRONG_ANSWER',
      COMPILE_ERROR: 'COMPILE_ERROR',
      RUNTIME_ERROR: 'RUNTIME_ERROR',
      TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
    };

    return statusMap[status] || 'RUNTIME_ERROR';
  }
}
