import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateProblemDto } from './dto/create-problem.dto';
import type { UpdateProblemDto } from './dto/update-problem.dto';
import type { CreateTestCaseDto, CreateBulkTestCasesDto } from './dto/create-testcase.dto';
import type { UpdateTestCaseDto } from './dto/update-testcase.dto';
import type { QueryProblemDto } from './dto/query-problem.dto';
import {
  ProblemResponseDto,
  ProblemListItemDto,
  PaginatedProblemsDto,
  TestCaseResponseDto,
} from './dto/problem-response.dto';
import { Prisma } from '@prisma/client';

type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

@Injectable()
export class ProblemsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== PROBLEM CRUD ====================

  async create(creatorId: string, userRole: string, dto: CreateProblemDto): Promise<ProblemResponseDto> {
    // Check if user has permission to create problems (only LECTURER and ADMIN)
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể tạo bài tập');
    }

    // Check if slug already exists
    const existingProblem = await this.prisma.problem.findUnique({
      where: { slug: dto.slug },
    });

    if (existingProblem) {
      throw new ConflictException('Slug đã tồn tại');
    }

    // Use a transaction to create problem with optional inline test cases
    const problem = await this.prisma.$transaction(async (tx) => {
      const createdProblem = await tx.problem.create({
        data: {
          title: dto.title,
          slug: dto.slug,
          description: dto.description,
          difficulty: dto.difficulty as Difficulty,
          starterCode: dto.starterCode || undefined,
          constraints: dto.constraints,
          hints: dto.hints || [],
          timeLimit: dto.timeLimit,
          memoryLimit: dto.memoryLimit,
          functionName: dto.functionName,
          inputTypes: dto.inputTypes || [],
          outputType: dto.outputType,
          argNames: dto.argNames || [],
          isPublished: dto.isPublished,
          creatorId,
        },
      });

      // Create inline test cases if provided
      if (dto.testCases && dto.testCases.length > 0) {
        await tx.testCase.createMany({
          data: dto.testCases.map((tc, index) => ({
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            explanation: tc.explanation,
            isHidden: tc.isHidden,
            isSample: tc.isSample,
            order: tc.order ?? index,
            problemId: createdProblem.id,
          })),
        });
      }

      // Re-fetch with test cases included
      return tx.problem.findUniqueOrThrow({
        where: { id: createdProblem.id },
        include: {
          testCases: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });

    const testCases = problem.testCases?.map((tc) => new TestCaseResponseDto(tc)) ?? [];

    return new ProblemResponseDto({
      ...problem,
      starterCode: problem.starterCode as Record<string, string> | null,
      testCases,
    });
  }

  async findAll(
    query: QueryProblemDto,
    userId?: string,
    userRole?: string,
  ): Promise<PaginatedProblemsDto> {
    const { page, limit, difficulty, search, isPublished, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ProblemWhereInput = {};

    // Only show published problems to students
    if (userRole === 'STUDENT') {
      where.isPublished = true;
    } else if (isPublished !== undefined) {
      where.isPublished = isPublished;
    }

    if (difficulty) {
      where.difficulty = difficulty as Difficulty;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    let orderBy: Prisma.ProblemOrderByWithRelationInput = {};
    if (sortBy === 'acceptanceRate') {
      // Custom sorting for acceptance rate
      orderBy = { acceptedSubmissions: sortOrder };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const [problems, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          title: true,
          slug: true,
          difficulty: true,
          totalSubmissions: true,
          acceptedSubmissions: true,
          isPublished: true,
        },
      }),
      this.prisma.problem.count({ where }),
    ]);

    const data = problems.map(
      (p) =>
        new ProblemListItemDto({
          ...p,
          acceptanceRate:
            p.totalSubmissions > 0
              ? Math.round((p.acceptedSubmissions / p.totalSubmissions) * 100)
              : 0,
        }),
    );

    return new PaginatedProblemsDto({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  async findOne(id: string, userId?: string, userRole?: string): Promise<ProblemResponseDto> {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      include: {
        testCases: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    // Check access for unpublished problems
    if (!problem.isPublished && userRole === 'STUDENT') {
      throw new ForbiddenException('Bạn không có quyền xem bài tập này');
    }

    // Filter test cases based on user role
    let testCases: TestCaseResponseDto[];
    let sampleTestCases: TestCaseResponseDto[];

    if (userRole === 'STUDENT') {
      // Students only see sample test cases and non-hidden test cases
      sampleTestCases = problem.testCases
        .filter((tc) => tc.isSample)
        .map((tc) => new TestCaseResponseDto(tc));
      testCases = problem.testCases
        .filter((tc) => !tc.isHidden)
        .map((tc) => new TestCaseResponseDto(tc));
    } else {
      // Lecturers and admins see all test cases
      testCases = problem.testCases.map((tc) => new TestCaseResponseDto(tc));
      sampleTestCases = problem.testCases
        .filter((tc) => tc.isSample)
        .map((tc) => new TestCaseResponseDto(tc));
    }

    return new ProblemResponseDto({
      ...problem,
      starterCode: problem.starterCode as Record<string, string> | null,
      testCases,
      sampleTestCases,
    });
  }

  async findBySlug(slug: string, userId?: string, userRole?: string): Promise<ProblemResponseDto> {
    const problem = await this.prisma.problem.findUnique({
      where: { slug },
      include: {
        testCases: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    // Check access for unpublished problems
    if (!problem.isPublished && userRole === 'STUDENT') {
      throw new ForbiddenException('Bạn không có quyền xem bài tập này');
    }

    // Filter test cases based on user role
    let testCases: TestCaseResponseDto[];
    let sampleTestCases: TestCaseResponseDto[];

    if (userRole === 'STUDENT') {
      sampleTestCases = problem.testCases
        .filter((tc) => tc.isSample)
        .map((tc) => new TestCaseResponseDto(tc));
      testCases = problem.testCases
        .filter((tc) => !tc.isHidden)
        .map((tc) => new TestCaseResponseDto(tc));
    } else {
      testCases = problem.testCases.map((tc) => new TestCaseResponseDto(tc));
      sampleTestCases = problem.testCases
        .filter((tc) => tc.isSample)
        .map((tc) => new TestCaseResponseDto(tc));
    }

    return new ProblemResponseDto({
      ...problem,
      starterCode: problem.starterCode as Record<string, string> | null,
      testCases,
      sampleTestCases,
    });
  }

  async update(
    id: string,
    dto: UpdateProblemDto,
    userId: string,
    userRole: string,
  ): Promise<ProblemResponseDto> {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    // Only creator or admin can update
    if (problem.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa bài tập này');
    }

    // Check slug uniqueness if updating
    if (dto.slug && dto.slug !== problem.slug) {
      const existingProblem = await this.prisma.problem.findUnique({
        where: { slug: dto.slug },
      });

      if (existingProblem) {
        throw new ConflictException('Slug đã tồn tại');
      }
    }

    const updated = await this.prisma.problem.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.description && { description: dto.description }),
        ...(dto.difficulty && { difficulty: dto.difficulty as Difficulty }),
        ...(dto.starterCode !== undefined && { starterCode: dto.starterCode || undefined }),
        ...(dto.constraints !== undefined && { constraints: dto.constraints }),
        ...(dto.hints && { hints: dto.hints }),
        ...(dto.timeLimit && { timeLimit: dto.timeLimit }),
        ...(dto.memoryLimit && { memoryLimit: dto.memoryLimit }),
        ...(dto.functionName && { functionName: dto.functionName }),
        ...(dto.inputTypes && { inputTypes: dto.inputTypes }),
        ...(dto.outputType && { outputType: dto.outputType }),
        ...(dto.argNames && { argNames: dto.argNames }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
      },
    });

    return new ProblemResponseDto({
      ...updated,
      starterCode: updated.starterCode as Record<string, string> | null,
    });
  }

  async remove(id: string, userId: string, userRole: string): Promise<{ message: string }> {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    // Only creator or admin can delete
    if (problem.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa bài tập này');
    }

    await this.prisma.problem.delete({
      where: { id },
    });

    return { message: 'Xóa bài tập thành công' };
  }

  // ==================== TEST CASE CRUD ====================

  async createTestCase(
    problemId: string,
    dto: CreateTestCaseDto,
    userId: string,
    userRole: string,
  ): Promise<TestCaseResponseDto> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    // Only creator or admin can add test cases
    if (problem.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền thêm test case');
    }

    const testCase = await this.prisma.testCase.create({
      data: {
        input: dto.input,
        expectedOutput: dto.expectedOutput,
        explanation: dto.explanation,
        isHidden: dto.isHidden,
        isSample: dto.isSample,
        order: dto.order,
        problemId,
      },
    });

    return new TestCaseResponseDto(testCase);
  }

  async createBulkTestCases(
    problemId: string,
    dto: CreateBulkTestCasesDto,
    userId: string,
    userRole: string,
  ): Promise<TestCaseResponseDto[]> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    // Only creator or admin can add test cases
    if (problem.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền thêm test case');
    }

    const testCases = await this.prisma.testCase.createManyAndReturn({
      data: dto.testCases.map((tc, index) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        explanation: tc.explanation,
        isHidden: tc.isHidden,
        isSample: tc.isSample,
        order: tc.order ?? index,
        problemId,
      })),
    });

    return testCases.map((tc) => new TestCaseResponseDto(tc));
  }

  async getTestCases(
    problemId: string,
    userId?: string,
    userRole?: string,
  ): Promise<TestCaseResponseDto[]> {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
    });

    if (!problem) {
      throw new NotFoundException('Bài tập không tồn tại');
    }

    const testCases = await this.prisma.testCase.findMany({
      where: { problemId },
      orderBy: { order: 'asc' },
    });

    // Filter based on user role
    if (userRole === 'STUDENT') {
      return testCases.filter((tc) => !tc.isHidden).map((tc) => new TestCaseResponseDto(tc));
    }

    return testCases.map((tc) => new TestCaseResponseDto(tc));
  }

  async updateTestCase(
    testCaseId: string,
    dto: UpdateTestCaseDto,
    userId: string,
    userRole: string,
  ): Promise<TestCaseResponseDto> {
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { problem: true },
    });

    if (!testCase) {
      throw new NotFoundException('Test case không tồn tại');
    }

    // Only creator or admin can update test cases
    if (testCase.problem.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa test case');
    }

    const updated = await this.prisma.testCase.update({
      where: { id: testCaseId },
      data: {
        ...(dto.input !== undefined && { input: dto.input }),
        ...(dto.expectedOutput !== undefined && { expectedOutput: dto.expectedOutput }),
        ...(dto.explanation !== undefined && { explanation: dto.explanation }),
        ...(dto.isHidden !== undefined && { isHidden: dto.isHidden }),
        ...(dto.isSample !== undefined && { isSample: dto.isSample }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });

    return new TestCaseResponseDto(updated);
  }

  async removeTestCase(
    testCaseId: string,
    userId: string,
    userRole: string,
  ): Promise<{ message: string }> {
    const testCase = await this.prisma.testCase.findUnique({
      where: { id: testCaseId },
      include: { problem: true },
    });

    if (!testCase) {
      throw new NotFoundException('Test case không tồn tại');
    }

    // Only creator or admin can delete test cases
    if (testCase.problem.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa test case');
    }

    await this.prisma.testCase.delete({
      where: { id: testCaseId },
    });

    return { message: 'Xóa test case thành công' };
  }

  // ==================== HELPER METHODS ====================

  async getAllTestCasesForExecution(problemId: string): Promise<TestCaseResponseDto[]> {
    // This method returns ALL test cases (including hidden) for code execution
    const testCases = await this.prisma.testCase.findMany({
      where: { problemId },
      orderBy: { order: 'asc' },
    });

    return testCases.map((tc) => new TestCaseResponseDto(tc));
  }

  async incrementSubmissionCount(problemId: string, accepted: boolean): Promise<void> {
    await this.prisma.problem.update({
      where: { id: problemId },
      data: {
        totalSubmissions: { increment: 1 },
        ...(accepted && { acceptedSubmissions: { increment: 1 } }),
      },
    });
  }
}
