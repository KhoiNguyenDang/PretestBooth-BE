import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as xlsx from 'xlsx';
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

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private async resolveSubjectRef(ref: string) {
    const value = ref.trim();
    if (!value) return null;

    if (this.isUuid(value)) {
      const byId = await this.prisma.subject.findUnique({ where: { id: value } });
      if (byId) return byId;
    }

    const matches = await this.prisma.subject.findMany({
      where: { name: { equals: value, mode: 'insensitive' } },
      take: 2,
    });

    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Nhiều subject trùng tên: ${value}`);
    return null;
  }

  private async resolveTopicRef(ref: string, subjectId?: string | null) {
    const value = ref.trim();
    if (!value) return null;

    if (this.isUuid(value)) {
      const byId = await this.prisma.topic.findUnique({ where: { id: value } });
      if (byId) return byId;
    }

    const where: Prisma.TopicWhereInput = {
      name: { equals: value, mode: 'insensitive' },
      ...(subjectId ? { subjectId } : {}),
    };

    const matches = await this.prisma.topic.findMany({ where, take: 2 });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new Error(`Nhiều topic trùng tên: ${value}`);
    return null;
  }

  private parseBooleanValue(value: unknown, defaultValue = false): boolean {
    if (value === null || value === undefined || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'y'].includes(text);
  }

  private normalizeDifficulty(value: unknown): Difficulty {
    const raw = String(value || 'MEDIUM').trim().toUpperCase();
    if (['EASY', 'MEDIUM', 'HARD'].includes(raw)) return raw as Difficulty;
    throw new Error('difficulty không hợp lệ (EASY/MEDIUM/HARD)');
  }

  private parseListValue(value: unknown): string[] {
    const raw = String(value || '').trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  async importProblems(file: Express.Multer.File, creatorId: string, userRole: string) {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể import bài tập');
    }

    if (!file) throw new BadRequestException('Vui lòng upload file CSV/Excel');

    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rows.length === 0) {
      throw new BadRequestException('File không có dữ liệu');
    }

    const result = {
      total: rows.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const [index, row] of rows.entries()) {
      const rowNum = index + 2;

      try {
        const title = String(row.title || '').trim();
        const slug = String(row.slug || '').trim().toLowerCase();
        const description = String(row.description || '').trim();
        const difficulty = this.normalizeDifficulty(row.difficulty || 'MEDIUM');
        const functionName = String(row.functionName || 'solution').trim() || 'solution';
        const outputType = String(row.outputType || 'void').trim() || 'void';
        const timeLimit = Number(row.timeLimit || 1000);
        const memoryLimit = Number(row.memoryLimit || 256);
        const constraints = String(row.constraints || '').trim() || null;
        const isPublished = this.parseBooleanValue(row.isPublished, false);
        const subjectRef = String(row.subjectId || row.subjectRef || row.subjectName || row.subject || '').trim();
        const topicRef = String(row.topicId || row.topicRef || row.topicName || row.topic || '').trim();

        if (!title || !slug || !description) {
          throw new Error('Thiếu trường bắt buộc (title, slug, description)');
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
          throw new Error('slug chỉ chứa chữ thường, số và dấu gạch ngang');
        }

        if (!Number.isInteger(timeLimit) || timeLimit <= 0) {
          throw new Error('timeLimit phải là số nguyên dương');
        }

        if (!Number.isInteger(memoryLimit) || memoryLimit <= 0) {
          throw new Error('memoryLimit phải là số nguyên dương');
        }

        const existing = await this.prisma.problem.findUnique({ where: { slug } });
        if (existing) {
          throw new Error(`slug đã tồn tại: ${slug}`);
        }

        const subject = subjectRef ? await this.resolveSubjectRef(subjectRef) : null;
        const subjectId = subject?.id || null;

        if (subjectRef && !subjectId) {
          throw new Error(`Không tìm thấy subject: ${subjectRef}`);
        }

        const topic = topicRef ? await this.resolveTopicRef(topicRef, subjectId) : null;
        const topicId = topic?.id || null;

        if (topicRef && !topicId) {
          throw new Error(`Không tìm thấy topic: ${topicRef}`);
        }

        if (topic && subjectId && topic.subjectId !== subjectId) {
          throw new Error('topic không thuộc subject đã chọn');
        }

        await this.prisma.problem.create({
          data: {
            title,
            slug,
            description,
            difficulty,
            functionName,
            outputType,
            timeLimit,
            memoryLimit,
            constraints,
            isPublished,
            inputTypes: this.parseListValue(row.inputTypes),
            argNames: this.parseListValue(row.argNames),
            hints: this.parseListValue(row.hints),
            subjectId,
            topicId,
            creatorId,
          },
        });

        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Dòng ${rowNum}: ${(err as Error).message}`);
      }
    }

    return result;
  }

  // ==================== PROBLEM CRUD ====================

  async create(
    creatorId: string,
    userRole: string,
    dto: CreateProblemDto,
  ): Promise<ProblemResponseDto> {
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
          subjectId: dto.subjectId || null,
          topicId: dto.topicId || null,
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
          subject: { select: { id: true, name: true } },
          topic: { select: { id: true, name: true } },
        },
      });
    });

    const testCases = problem.testCases?.map((tc) => new TestCaseResponseDto(tc)) ?? [];

    return new ProblemResponseDto({
      ...problem,
      starterCode: problem.starterCode as Record<string, string> | null,
      subject: problem.subject || null,
      topic: problem.topic || null,
      testCases,
    });
  }

  async findAll(
    query: QueryProblemDto,
    userId?: string,
    userRole?: string,
  ): Promise<PaginatedProblemsDto> {
    const { page, limit, difficulty, search, isPublished, sortBy, sortOrder } = query;
    const subjectId = (query as any).subjectId;
    const topicId = (query as any).topicId;
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

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (topicId) {
      where.topicId = topicId;
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
          subjectId: true,
          topicId: true,
          subject: { select: { id: true, name: true } },
          topic: { select: { id: true, name: true } },
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
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
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
      subject: problem.subject || null,
      topic: problem.topic || null,
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
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
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
      subject: problem.subject || null,
      topic: problem.topic || null,
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
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId || null }),
        ...(dto.topicId !== undefined && { topicId: dto.topicId || null }),
      },
      include: {
        subject: { select: { id: true, name: true } },
        topic: { select: { id: true, name: true } },
      },
    });

    return new ProblemResponseDto({
      ...updated,
      starterCode: updated.starterCode as Record<string, string> | null,
      subject: updated.subject || null,
      topic: updated.topic || null,
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
