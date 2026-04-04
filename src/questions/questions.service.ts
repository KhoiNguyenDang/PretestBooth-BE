import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
import { AuthorizationService } from '../common/authorization/authorization.service';

import * as xlsx from 'xlsx';
import * as iconv from 'iconv-lite';

type QuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'SHORT_ANSWER';
type QuestionClassification = 'PRACTICE' | 'EXAM';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private normalizeClassification(rawValue: unknown): QuestionClassification | undefined {
    if (!rawValue) return undefined;

    const normalized = String(rawValue).trim().toUpperCase();
    if (!normalized) return undefined;

    if (['PRACTICE', 'LUYEN_TAP', 'LUYENTAP'].includes(normalized)) {
      return 'PRACTICE';
    }

    if (['EXAM', 'THI', 'DE_THI'].includes(normalized)) {
      return 'EXAM';
    }

    return undefined;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private parseBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    return undefined;
  }

  private parseAnswerKeys(rawValue: unknown): Set<string> {
    if (!rawValue) return new Set();

    return new Set(
      String(rawValue)
        .toUpperCase()
        .split(/[,;\s]+/)
        .map((v) => v.trim())
        .filter((v) => ['A', 'B', 'C', 'D'].includes(v)),
    );
  }

  private normalizeReferenceLabel(rawValue: unknown): string {
    if (!rawValue) return '';

    return String(rawValue)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]/g, '');
  }

  private async assertQuestionBankPermission(userId: string, userRole: string, actionLabel: string) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (userRole !== 'LECTURER') {
      throw new ForbiddenException(`Chỉ giảng viên và quản trị viên mới có thể ${actionLabel}`);
    }

    await this.authorizationService.assertPermission(
      userId,
      userRole,
      'MANAGE_QUESTION_BANK',
      'Giảng viên chưa được cấp quyền quản lý ngân hàng câu hỏi',
    );
  }
  // ========== IMPORT QUESTIONS FROM FILE ==========
  async importQuestions(file: Express.Multer.File, userId: string, userRole: string) {
    if (!file) throw new BadRequestException('Vui lòng upload file Excel/CSV');
    await this.assertQuestionBankPermission(userId, userRole, 'import câu hỏi');
    let data = [];
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext === 'csv') {
      // Đọc CSV chuẩn UTF-8
      const content = iconv.decode(file.buffer, 'utf-8');
      const workbook = xlsx.read(content, { type: 'string' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = xlsx.utils.sheet_to_json(sheet, { raw: false });
    } else {
      // Excel
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = xlsx.utils.sheet_to_json(sheet, { raw: false });
    }

    const total = data.length;
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    const subjectCache = new Map<string, string>();
    const topicCache = new Map<string, string>();
    let subjectReferenceLookup: Array<{ id: string; normalized: string }> | null = null;
    let topicReferenceLookup: Array<{ id: string; normalized: string; subjectId: string }> | null =
      null;

    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      const rowNumber = index + 2;

      try {
        const subjectRefRaw =
          row['subjectId'] || row['Môn'] || row['subjectRef'] || row['subject'];
        const topicRefRaw = row['topicId'] || row['Chủ đề'] || row['topicRef'] || row['topic'];

        let subjectId = subjectRefRaw ? String(subjectRefRaw).trim() : '';
        if (subjectId && !this.isUuid(subjectId)) {
          if (subjectCache.has(subjectId)) {
            subjectId = subjectCache.get(subjectId)!;
          } else {
            let matchedSubject = await this.prisma.subject.findFirst({
              where: { name: { equals: subjectId, mode: 'insensitive' } },
              select: { id: true },
            });

            if (!matchedSubject) {
              if (!subjectReferenceLookup) {
                const subjects = await this.prisma.subject.findMany({
                  select: { id: true, name: true },
                });
                subjectReferenceLookup = subjects.map((s) => ({
                  id: s.id,
                  normalized: this.normalizeReferenceLabel(s.name),
                }));
              }

              const normalizedSubjectRef = this.normalizeReferenceLabel(subjectId);
              const matchedByNormalized = subjectReferenceLookup.find(
                (s) => s.normalized === normalizedSubjectRef,
              );
              if (matchedByNormalized) {
                matchedSubject = { id: matchedByNormalized.id };
              }
            }

            if (!matchedSubject) {
              failed++;
              errors.push(`Dòng ${rowNumber}: Không tìm thấy môn học '${subjectRefRaw}'`);
              continue;
            }
            subjectCache.set(subjectId, matchedSubject.id);
            subjectId = matchedSubject.id;
          }
        }

        let topicId: string | null = topicRefRaw ? String(topicRefRaw).trim() : null;
        if (topicId && !this.isUuid(topicId)) {
          const cacheKey = `${subjectId || 'any'}::${topicId}`;
          if (topicCache.has(cacheKey)) {
            topicId = topicCache.get(cacheKey)!;
          } else {
            let matchedTopic = await this.prisma.topic.findFirst({
              where: {
                name: { equals: topicId, mode: 'insensitive' },
                ...(subjectId ? { subjectId } : {}),
              },
              select: { id: true },
            });

            if (!matchedTopic) {
              if (!topicReferenceLookup) {
                const topics = await this.prisma.topic.findMany({
                  select: { id: true, name: true, subjectId: true },
                });
                topicReferenceLookup = topics.map((t) => ({
                  id: t.id,
                  subjectId: t.subjectId,
                  normalized: this.normalizeReferenceLabel(t.name),
                }));
              }

              const normalizedTopicRef = this.normalizeReferenceLabel(topicId);
              const matchedByNormalized = topicReferenceLookup.find(
                (t) =>
                  t.normalized === normalizedTopicRef &&
                  (!subjectId || t.subjectId === subjectId),
              );
              if (matchedByNormalized) {
                matchedTopic = { id: matchedByNormalized.id };
              }
            }

            if (matchedTopic) {
              topicCache.set(cacheKey, matchedTopic.id);
              topicId = matchedTopic.id;
            } else {
              topicId = null;
            }
          }
        }

        const answerKeys = this.parseAnswerKeys(
          row['Đáp án đúng'] || row['correctAnswer'] || row['correctAns'] || row['answerKey'],
        );

        const dto: any = {
          content: row['content'] || row['Câu hỏi'],
          imageUrl: row['imageUrl'] || row['image'] || row['Hình ảnh'] || row['Anh'] || null,
          questionType: row['questionType'] || row['Loại'],
          classification:
            this.normalizeClassification(
              row['classification'] ||
                row['questionClassification'] ||
                row['Phân loại'] ||
                row['examType'] ||
                row['loaiDe'],
            ) || 'EXAM',
          difficulty: row['difficulty'] || row['Mức độ'],
          correctAnswer:
            row['correctAnswer'] || row['Đáp án đúng'] || row['correctAns'] || row['answerKey'],
          explanation: row['explanation'] || row['Giải thích'],
          subjectId,
          topicId,
          isPublished: this.parseBoolean(row['isPublished'] || row['Công khai']),
        };
        if (
          row['A'] ||
          row['B'] ||
          row['C'] ||
          row['D'] ||
          row['optionA'] ||
          row['optionB'] ||
          row['optionC'] ||
          row['optionD']
        ) {
          dto.choices = [
            (row['A'] || row['optionA']) && {
              content: row['A'] || row['optionA'],
              isCorrect: answerKeys.has('A'),
            },
            (row['B'] || row['optionB']) && {
              content: row['B'] || row['optionB'],
              isCorrect: answerKeys.has('B'),
            },
            (row['C'] || row['optionC']) && {
              content: row['C'] || row['optionC'],
              isCorrect: answerKeys.has('C'),
            },
            (row['D'] || row['optionD']) && {
              content: row['D'] || row['optionD'],
              isCorrect: answerKeys.has('D'),
            },
          ].filter(Boolean);
        }
        // Bắt buộc phải có content, questionType, difficulty, subjectId
        if (!dto.content || !dto.questionType || !dto.difficulty || !dto.subjectId) {
          failed++;
          errors.push(
            `Dòng ${rowNumber}: Thiếu trường bắt buộc (content/questionType/difficulty/subjectRef)`,
          );
          continue;
        }
        await this.create(userId, userRole, dto);
        imported++;
      } catch (e: any) {
        failed++;
        errors.push(`Dòng ${rowNumber}: ${e?.message || 'Import thất bại'}`);
        continue;
      }
    }

    return {
      message: `Đã import thành công ${imported}/${total} câu hỏi!`,
      total,
      success: imported,
      failed,
      errors: errors.slice(0, 50),
    };
  }

  // ==================== SUBJECT CRUD ====================

  async createSubject(
    dto: CreateSubjectDto,
    userId: string,
    userRole: string,
  ): Promise<SubjectResponseDto> {
    await this.assertQuestionBankPermission(userId, userRole, 'tạo môn học');

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
    userId: string,
    userRole: string,
  ): Promise<SubjectResponseDto> {
    await this.assertQuestionBankPermission(userId, userRole, 'cập nhật môn học');

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

  async deleteSubject(id: string, userId: string, userRole: string): Promise<{ message: string }> {
    await this.assertQuestionBankPermission(userId, userRole, 'xóa môn học');

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
    userId: string,
    userRole: string,
  ): Promise<TopicResponseDto> {
    await this.assertQuestionBankPermission(userId, userRole, 'tạo chủ đề');

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

  async updateTopic(
    id: string,
    dto: UpdateTopicDto,
    userId: string,
    userRole: string,
  ): Promise<TopicResponseDto> {
    await this.assertQuestionBankPermission(userId, userRole, 'cập nhật chủ đề');

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

  async deleteTopic(id: string, userId: string, userRole: string): Promise<{ message: string }> {
    await this.assertQuestionBankPermission(userId, userRole, 'xóa chủ đề');

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
    await this.assertQuestionBankPermission(creatorId, userRole, 'tạo câu hỏi');

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
          imageUrl: dto.imageUrl?.trim() || null,
          questionType: dto.questionType as QuestionType,
          classification: dto.classification as QuestionClassification,
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
      classification,
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

    if (classification) {
      (where as any).classification = classification as QuestionClassification;
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
          imageUrl: q.imageUrl,
          questionType: q.questionType as QuestionListItemDto['questionType'],
          classification: (q as any).classification as QuestionListItemDto['classification'],
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
    await this.assertQuestionBankPermission(userId, userRole, 'cập nhật câu hỏi');

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
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl?.trim() || null }),
          ...(dto.questionType && { questionType: dto.questionType as QuestionType }),
          ...(dto.classification && {
            classification: dto.classification as QuestionClassification,
          }),
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
    await this.assertQuestionBankPermission(userId, userRole, 'xóa câu hỏi');

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
    await this.assertQuestionBankPermission(userId, userRole, 'thay đổi trạng thái câu hỏi');

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
      imageUrl: question.imageUrl,
      questionType: question.questionType,
      classification: question.classification,
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
