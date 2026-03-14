import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as xlsx from 'xlsx';
import type { CreateSubjectDto, UpdateSubjectDto } from './dto/create-subject.dto';
import type { CreateTopicDto, UpdateTopicDto } from './dto/create-topic.dto';
import type { CreateQuestionDto } from './dto/create-question.dto';
import type { UpdateQuestionDto } from './dto/update-question.dto';
import type { QueryQuestionDto } from './dto/query-question.dto';
import {
  SubjectResponseDto,
  TopicResponseDto,
  QuestionDetailResponseDto,
  QuestionChoiceResponseDto,
  QuestionListItemDto,
  PaginatedQuestionsDto,
} from './dto/question-response.dto';
import { Prisma } from '@prisma/client';

type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

@Injectable()
export class QuestionsService {
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

  private normalizeQuestionType(value: unknown): QuestionType {
    const raw = String(value || 'SINGLE_CHOICE').trim().toUpperCase();
    if (raw === 'SINGLE' || raw === 'SINGLE_CHOICE') return 'SINGLE_CHOICE';
    if (raw === 'MULTIPLE' || raw === 'MULTIPLE_CHOICE') return 'MULTIPLE_CHOICE';
    if (raw === 'SHORT' || raw === 'SHORT_ANSWER') return 'SHORT_ANSWER';
    throw new Error('questionType không hợp lệ');
  }

  private normalizeDifficulty(value: unknown): Difficulty {
    const raw = String(value || 'MEDIUM').trim().toUpperCase();
    if (['EASY', 'MEDIUM', 'HARD'].includes(raw)) return raw as Difficulty;
    throw new Error('difficulty không hợp lệ (EASY/MEDIUM/HARD)');
  }

  private parseCorrectIndexes(correctAnswer: string): number[] {
    return correctAnswer
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .map((token) => {
        if (/^\d+$/.test(token)) return parseInt(token, 10) - 1;
        if (/^[A-Z]$/.test(token)) return token.charCodeAt(0) - 'A'.charCodeAt(0);
        return NaN;
      })
      .filter((idx) => Number.isInteger(idx) && idx >= 0);
  }

  async importQuestions(file: Express.Multer.File, creatorId: string, userRole: string) {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể import câu hỏi');
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
        const content = String(row.content || '').trim();
        const questionType = this.normalizeQuestionType(row.questionType);
        const difficulty = this.normalizeDifficulty(row.difficulty || 'MEDIUM');
        const subjectRef = String(row.subjectId || row.subjectRef || row.subjectName || row.subject || '').trim();
        const topicRef = String(row.topicId || row.topicRef || row.topicName || row.topic || '').trim();
        const explanation = String(row.explanation || '').trim() || null;
        const isPublished = this.parseBooleanValue(row.isPublished, false);
        const correctAnswerRaw = String(row.correctAnswer || '').trim();

        if (!content || !subjectRef) {
          throw new Error('Thiếu trường bắt buộc (content, subjectRef/subjectId/subjectName)');
        }

        const subject = await this.resolveSubjectRef(subjectRef);
        if (!subject) throw new Error(`Không tìm thấy subject: ${subjectRef}`);
        const subjectId = subject.id;

        const topic = topicRef ? await this.resolveTopicRef(topicRef, subjectId) : null;
        const topicId = topic?.id || null;

        if (topicRef && !topicId) {
          throw new Error(`Không tìm thấy topic: ${topicRef}`);
        }

        if (topic && topic.subjectId !== subjectId) {
          throw new Error('topic không thuộc subject đã chọn');
        }

        await this.prisma.$transaction(async (tx) => {
          const createdQuestion = await tx.question.create({
            data: {
              content,
              questionType,
              difficulty,
              subjectId,
              topicId,
              explanation,
              isPublished,
              correctAnswer: questionType === 'SHORT_ANSWER' ? correctAnswerRaw : null,
              creatorId,
            },
          });

          if (questionType === 'SHORT_ANSWER') {
            if (!correctAnswerRaw) {
              throw new Error('SHORT_ANSWER yêu cầu correctAnswer');
            }
            return;
          }

          const optionValues = [row.optionA, row.optionB, row.optionC, row.optionD]
            .map((opt) => String(opt || '').trim())
            .filter((opt) => opt.length > 0);

          if (optionValues.length < 2) {
            throw new Error('Câu hỏi trắc nghiệm cần ít nhất 2 lựa chọn (optionA, optionB, ...)');
          }

          const correctIndexes = this.parseCorrectIndexes(correctAnswerRaw);

          if (questionType === 'SINGLE_CHOICE' && correctIndexes.length !== 1) {
            throw new Error('SINGLE_CHOICE yêu cầu đúng 1 đáp án đúng (correctAnswer)');
          }

          if (questionType === 'MULTIPLE_CHOICE' && correctIndexes.length < 2) {
            throw new Error('MULTIPLE_CHOICE yêu cầu ít nhất 2 đáp án đúng (correctAnswer)');
          }

          await tx.questionChoice.createMany({
            data: optionValues.map((content, i) => ({
              questionId: createdQuestion.id,
              content,
              isCorrect: correctIndexes.includes(i),
              order: i,
            })),
          });
        });

        result.success++;
      } catch (err) {
        result.failed++;
        result.errors.push(`Dòng ${rowNum}: ${(err as Error).message}`);
      }
    }

    return result;
  }

  // ==================== SUBJECT CRUD ====================

  async createSubject(dto: CreateSubjectDto, userRole: string): Promise<SubjectResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể tạo môn học');
    }

    const existing = await this.prisma.subject.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Tên môn học đã tồn tại');
    }

    const subject = await this.prisma.subject.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: {
        _count: { select: { topics: true, questions: true } },
      },
    });

    return new SubjectResponseDto({
      ...subject,
      topicCount: subject._count.topics,
      questionCount: subject._count.questions,
    });
  }

  async findAllSubjects(): Promise<SubjectResponseDto[]> {
    const subjects = await this.prisma.subject.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { topics: true, questions: true } },
      },
    });

    return subjects.map(
      (s) =>
        new SubjectResponseDto({
          ...s,
          topicCount: s._count.topics,
          questionCount: s._count.questions,
        }),
    );
  }

  async updateSubject(
    id: string,
    dto: UpdateSubjectDto,
    userRole: string,
  ): Promise<SubjectResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể cập nhật môn học');
    }

    const subject = await this.prisma.subject.findUnique({ where: { id } });
    if (!subject) {
      throw new NotFoundException('Môn học không tồn tại');
    }

    if (dto.name && dto.name !== subject.name) {
      const existing = await this.prisma.subject.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Tên môn học đã tồn tại');
      }
    }

    const updated = await this.prisma.subject.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: {
        _count: { select: { topics: true, questions: true } },
      },
    });

    return new SubjectResponseDto({
      ...updated,
      topicCount: updated._count.topics,
      questionCount: updated._count.questions,
    });
  }

  async deleteSubject(id: string, userRole: string): Promise<{ message: string }> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể xóa môn học');
    }

    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });

    if (!subject) {
      throw new NotFoundException('Môn học không tồn tại');
    }

    if (subject._count.questions > 0) {
      throw new BadRequestException(
        'Không thể xóa môn học đang có câu hỏi. Hãy xóa hoặc chuyển các câu hỏi trước.',
      );
    }

    await this.prisma.subject.delete({ where: { id } });

    return { message: 'Xóa môn học thành công' };
  }

  // ==================== TOPIC CRUD ====================

  async createTopic(
    subjectId: string,
    dto: CreateTopicDto,
    userRole: string,
  ): Promise<TopicResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể tạo chủ đề');
    }

    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException('Môn học không tồn tại');
    }

    const existing = await this.prisma.topic.findUnique({
      where: { subjectId_name: { subjectId, name: dto.name } },
    });

    if (existing) {
      throw new ConflictException('Chủ đề đã tồn tại trong môn học này');
    }

    const topic = await this.prisma.topic.create({
      data: {
        name: dto.name,
        subjectId,
      },
      include: {
        _count: { select: { questions: true } },
      },
    });

    return new TopicResponseDto({
      ...topic,
      questionCount: topic._count.questions,
    });
  }

  async findTopicsBySubject(subjectId: string): Promise<TopicResponseDto[]> {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) {
      throw new NotFoundException('Môn học không tồn tại');
    }

    const topics = await this.prisma.topic.findMany({
      where: { subjectId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { questions: true } },
      },
    });

    return topics.map(
      (t) =>
        new TopicResponseDto({
          ...t,
          questionCount: t._count.questions,
        }),
    );
  }

  async updateTopic(id: string, dto: UpdateTopicDto, userRole: string): Promise<TopicResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể cập nhật chủ đề');
    }

    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) {
      throw new NotFoundException('Chủ đề không tồn tại');
    }

    if (dto.name && dto.name !== topic.name) {
      const existing = await this.prisma.topic.findUnique({
        where: { subjectId_name: { subjectId: topic.subjectId, name: dto.name } },
      });
      if (existing) {
        throw new ConflictException('Chủ đề đã tồn tại trong môn học này');
      }
    }

    const updated = await this.prisma.topic.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
      },
      include: {
        _count: { select: { questions: true } },
      },
    });

    return new TopicResponseDto({
      ...updated,
      questionCount: updated._count.questions,
    });
  }

  async deleteTopic(id: string, userRole: string): Promise<{ message: string }> {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể xóa chủ đề');
    }

    const topic = await this.prisma.topic.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });

    if (!topic) {
      throw new NotFoundException('Chủ đề không tồn tại');
    }

    if (topic._count.questions > 0) {
      throw new BadRequestException(
        'Không thể xóa chủ đề đang có câu hỏi. Hãy xóa hoặc chuyển các câu hỏi trước.',
      );
    }

    await this.prisma.topic.delete({ where: { id } });

    return { message: 'Xóa chủ đề thành công' };
  }

  // ==================== QUESTION CRUD ====================

  async create(
    creatorId: string,
    userRole: string,
    dto: CreateQuestionDto,
  ): Promise<QuestionDetailResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể tạo câu hỏi');
    }

    // Validate subject exists
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) {
      throw new NotFoundException('Môn học không tồn tại');
    }

    // Validate topic if provided
    if (dto.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
      if (!topic) {
        throw new NotFoundException('Chủ đề không tồn tại');
      }
      if (topic.subjectId !== dto.subjectId) {
        throw new BadRequestException('Chủ đề không thuộc môn học đã chọn');
      }
    }

    const question = await this.prisma.$transaction(async (tx) => {
      const createdQuestion = await tx.question.create({
        data: {
          content: dto.content,
          questionType: dto.questionType as QuestionType,
          difficulty: dto.difficulty as Difficulty,
          correctAnswer: dto.correctAnswer,
          explanation: dto.explanation,
          isPublished: dto.isPublished,
          subjectId: dto.subjectId,
          topicId: dto.topicId || null,
          creatorId,
        },
      });

      // Create choices for SINGLE_CHOICE / MULTIPLE_CHOICE
      if (dto.choices && dto.choices.length > 0) {
        await tx.questionChoice.createMany({
          data: dto.choices.map((choice, index) => ({
            content: choice.content,
            isCorrect: choice.isCorrect,
            order: choice.order ?? index,
            questionId: createdQuestion.id,
          })),
        });
      }

      return tx.question.findUniqueOrThrow({
        where: { id: createdQuestion.id },
        include: {
          subject: true,
          topic: true,
          choices: { orderBy: { order: 'asc' } },
        },
      });
    });

    return this.mapToDetailResponse(question);
  }

  async findAll(
    query: QueryQuestionDto,
    userId?: string,
    userRole?: string,
  ): Promise<PaginatedQuestionsDto> {
    const {
      page,
      limit,
      questionType,
      difficulty,
      subjectId,
      topicId,
      search,
      isPublished,
      sortBy,
      sortOrder,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.QuestionWhereInput = {};

    // Students only see published questions
    if (userRole === 'STUDENT') {
      where.isPublished = true;
    } else if (isPublished !== undefined) {
      where.isPublished = isPublished;
    }

    if (questionType) {
      where.questionType = questionType as QuestionType;
    }

    if (difficulty) {
      where.difficulty = difficulty as Difficulty;
    }

    if (subjectId) {
      where.subjectId = subjectId;
    }

    if (topicId) {
      where.topicId = topicId;
    }

    if (search) {
      where.content = { contains: search, mode: 'insensitive' };
    }

    const orderBy: Prisma.QuestionOrderByWithRelationInput = { [sortBy]: sortOrder };

    const [questions, total] = await Promise.all([
      this.prisma.question.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          subject: { select: { id: true, name: true } },
          topic: { select: { id: true, name: true } },
          _count: { select: { choices: true } },
        },
      }),
      this.prisma.question.count({ where }),
    ]);

    const data = questions.map(
      (q) =>
        new QuestionListItemDto({
          id: q.id,
          content: q.content,
          questionType: q.questionType as QuestionListItemDto['questionType'],
          difficulty: q.difficulty as QuestionListItemDto['difficulty'],
          isPublished: q.isPublished,
          subjectId: q.subjectId,
          topicId: q.topicId,
          subject: q.subject,
          topic: q.topic,
          choiceCount: q._count.choices,
          createdAt: q.createdAt,
        }),
    );

    return new PaginatedQuestionsDto({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  async findOne(
    id: string,
    userId?: string,
    userRole?: string,
  ): Promise<QuestionDetailResponseDto> {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: {
        subject: true,
        topic: true,
        choices: { orderBy: { order: 'asc' } },
      },
    });

    if (!question) {
      throw new NotFoundException('Câu hỏi không tồn tại');
    }

    if (!question.isPublished && userRole === 'STUDENT') {
      throw new ForbiddenException('Bạn không có quyền xem câu hỏi này');
    }

    const response = this.mapToDetailResponse(question);

    // Students should not see correct answers
    if (userRole === 'STUDENT') {
      response.correctAnswer = null;
      response.explanation = null;
      if (response.choices) {
        response.choices = response.choices.map((c) => {
          c.isCorrect = undefined as unknown as boolean;
          return c;
        });
      }
    }

    return response;
  }

  async update(
    id: string,
    dto: UpdateQuestionDto,
    userId: string,
    userRole: string,
  ): Promise<QuestionDetailResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể cập nhật câu hỏi');
    }

    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Câu hỏi không tồn tại');
    }

    if (question.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa câu hỏi này');
    }

    // Validate subject if changing
    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
      if (!subject) {
        throw new NotFoundException('Môn học không tồn tại');
      }
    }

    // Validate topic if changing
    if (dto.topicId) {
      const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
      if (!topic) {
        throw new NotFoundException('Chủ đề không tồn tại');
      }
      const targetSubjectId = dto.subjectId || question.subjectId;
      if (topic.subjectId !== targetSubjectId) {
        throw new BadRequestException('Chủ đề không thuộc môn học đã chọn');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id },
        data: {
          ...(dto.content && { content: dto.content }),
          ...(dto.questionType && { questionType: dto.questionType as QuestionType }),
          ...(dto.difficulty && { difficulty: dto.difficulty as Difficulty }),
          ...(dto.correctAnswer !== undefined && { correctAnswer: dto.correctAnswer }),
          ...(dto.explanation !== undefined && { explanation: dto.explanation }),
          ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
          ...(dto.subjectId && { subjectId: dto.subjectId }),
          ...(dto.topicId !== undefined && { topicId: dto.topicId }),
        },
      });

      // If choices are provided, replace all choices
      if (dto.choices) {
        await tx.questionChoice.deleteMany({ where: { questionId: id } });
        await tx.questionChoice.createMany({
          data: dto.choices.map((choice, index) => ({
            content: choice.content,
            isCorrect: choice.isCorrect,
            order: choice.order ?? index,
            questionId: id,
          })),
        });
      }

      return tx.question.findUniqueOrThrow({
        where: { id },
        include: {
          subject: true,
          topic: true,
          choices: { orderBy: { order: 'asc' } },
        },
      });
    });

    return this.mapToDetailResponse(updated);
  }

  async remove(id: string, userId: string, userRole: string): Promise<{ message: string }> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể xóa câu hỏi');
    }

    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Câu hỏi không tồn tại');
    }

    if (question.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền xóa câu hỏi này');
    }

    await this.prisma.question.delete({ where: { id } });

    return { message: 'Xóa câu hỏi thành công' };
  }

  async togglePublish(
    id: string,
    userId: string,
    userRole: string,
  ): Promise<QuestionDetailResponseDto> {
    if (!['LECTURER', 'ADMIN'].includes(userRole)) {
      throw new ForbiddenException(
        'Chỉ giảng viên và quản trị viên mới có thể thay đổi trạng thái câu hỏi',
      );
    }

    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Câu hỏi không tồn tại');
    }

    if (question.creatorId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền thay đổi trạng thái câu hỏi này');
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: { isPublished: !question.isPublished },
      include: {
        subject: true,
        topic: true,
        choices: { orderBy: { order: 'asc' } },
      },
    });

    return this.mapToDetailResponse(updated);
  }

  // ==================== HELPER METHODS ====================

  private mapToDetailResponse(question: any): QuestionDetailResponseDto {
    const choices = question.choices?.map(
      (c: any) =>
        new QuestionChoiceResponseDto({
          id: c.id,
          content: c.content,
          isCorrect: c.isCorrect,
          order: c.order,
        }),
    );

    const subject = question.subject
      ? new SubjectResponseDto({
          id: question.subject.id,
          name: question.subject.name,
          description: question.subject.description,
          createdAt: question.subject.createdAt,
          updatedAt: question.subject.updatedAt,
        })
      : undefined;

    const topic = question.topic
      ? new TopicResponseDto({
          id: question.topic.id,
          name: question.topic.name,
          subjectId: question.topic.subjectId,
          createdAt: question.topic.createdAt,
          updatedAt: question.topic.updatedAt,
        })
      : null;

    return new QuestionDetailResponseDto({
      id: question.id,
      content: question.content,
      questionType: question.questionType,
      difficulty: question.difficulty,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      isPublished: question.isPublished,
      subjectId: question.subjectId,
      topicId: question.topicId,
      creatorId: question.creatorId,
      subject,
      topic,
      choices,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
    });
  }
}
