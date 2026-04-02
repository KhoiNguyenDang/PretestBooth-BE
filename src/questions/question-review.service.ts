import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionReviewStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import type { GenerateReviewSessionsDto } from './dto/generate-review-sessions.dto';
import type { QueryReviewSessionsDto } from './dto/query-review-sessions.dto';
import type { ResubmitQuestionReviewDto } from './dto/resubmit-question-review.dto';
import type { SubmitQuestionReviewDto } from './dto/submit-question-review.dto';

@Injectable()
export class QuestionReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async assertReviewPermission(userId: string, userRole: string) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (userRole !== 'LECTURER') {
      throw new ForbiddenException('Chỉ giảng viên và quản trị viên mới có thể review câu hỏi');
    }

    await this.authorizationService.assertPermission(
      userId,
      userRole,
      'REVIEW_QUESTION',
      'Giảng viên chưa được cấp quyền review câu hỏi',
    );
  }

  async createQuarterlySessions(input?: GenerateReviewSessionsDto) {
    const today = new Date();
    const quarter = input?.quarter ?? this.getQuarter(today);
    const year = input?.year ?? today.getFullYear();

    this.assertQuarter(quarter);

    const dateRange = this.getQuarterDateRange(quarter, year);
    const academicYear = this.getAcademicYear(dateRange.startDate);

    const publishedQuestions = await this.prisma.question.findMany({
      where: { isPublished: true },
      select: { id: true },
    });

    if (publishedQuestions.length === 0) {
      return {
        quarter,
        year,
        academicYear,
        totalPublishedQuestions: 0,
        createdSessions: 0,
      };
    }

    const result = await this.prisma.questionReviewSession.createMany({
      data: publishedQuestions.map((question) => ({
        quarter,
        year,
        academicYear,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        questionId: question.id,
      })),
      skipDuplicates: true,
    });

    return {
      quarter,
      year,
      academicYear,
      totalPublishedQuestions: publishedQuestions.length,
      createdSessions: result.count,
    };
  }

  async getReviewSessions(query: QueryReviewSessionsDto, userId: string, userRole: string) {
    await this.assertReviewPermission(userId, userRole);

    const today = new Date();
    const quarter = query.quarter ?? this.getQuarter(today);
    const year = query.year ?? today.getFullYear();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    this.assertQuarter(quarter);

    const where = {
      quarter,
      year,
      ...(query.status ? { status: query.status } : {}),
    } as const;

    const [total, sessions, groupedStats] = await Promise.all([
      this.prisma.questionReviewSession.count({ where }),
      this.prisma.questionReviewSession.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        include: {
          question: {
            include: {
              subject: { select: { id: true, name: true } },
              topic: { select: { id: true, name: true } },
              choices: { orderBy: { order: 'asc' } },
            },
          },
          reviewer: {
            select: { id: true, name: true, email: true },
          },
          actions: {
            orderBy: { reviewedAt: 'desc' },
            include: {
              reviewer: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      }),
      this.prisma.questionReviewSession.groupBy({
        by: ['status'],
        where: { quarter, year },
        _count: { _all: true },
      }),
    ]);

    const stats = {
      total: groupedStats.reduce((acc, item) => acc + item._count._all, 0),
      pending: groupedStats.find((item) => item.status === QuestionReviewStatus.PENDING)?._count
        ._all ?? 0,
      resubmitted:
        groupedStats.find((item) => item.status === QuestionReviewStatus.RESUBMITTED)?._count
          ._all ?? 0,
      approved:
        groupedStats.find((item) => item.status === QuestionReviewStatus.APPROVED)?._count._all ?? 0,
      needsRevision:
        groupedStats.find((item) => item.status === QuestionReviewStatus.NEEDS_REVISION)?._count._all ?? 0,
      skipped:
        groupedStats.find((item) => item.status === QuestionReviewStatus.SKIPPED)?._count._all ?? 0,
    };

    return {
      data: sessions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async getReviewStats(userId: string, userRole: string, quarter?: number, year?: number) {
    await this.assertReviewPermission(userId, userRole);

    const today = new Date();
    const resolvedQuarter = quarter ?? this.getQuarter(today);
    const resolvedYear = year ?? today.getFullYear();

    this.assertQuarter(resolvedQuarter);

    const grouped = await this.prisma.questionReviewSession.groupBy({
      by: ['status'],
      where: {
        quarter: resolvedQuarter,
        year: resolvedYear,
      },
      _count: { _all: true },
    });

    const total = grouped.reduce((acc, item) => acc + item._count._all, 0);
    const pending =
      grouped.find((item) => item.status === QuestionReviewStatus.PENDING)?._count._all ?? 0;
    const resubmitted =
      grouped.find((item) => item.status === QuestionReviewStatus.RESUBMITTED)?._count._all ?? 0;
    const approved =
      grouped.find((item) => item.status === QuestionReviewStatus.APPROVED)?._count._all ?? 0;
    const needsRevision =
      grouped.find((item) => item.status === QuestionReviewStatus.NEEDS_REVISION)?._count._all ?? 0;
    const skipped =
      grouped.find((item) => item.status === QuestionReviewStatus.SKIPPED)?._count._all ?? 0;

    return {
      quarter: resolvedQuarter,
      year: resolvedYear,
      total,
      pending,
      resubmitted,
      approved,
      needsRevision,
      skipped,
      completionRate: total === 0 ? 0 : Math.round(((total - pending - resubmitted) / total) * 100),
    };
  }

  async submitReview(dto: SubmitQuestionReviewDto, reviewerId: string, reviewerRole: string) {
    await this.assertReviewPermission(reviewerId, reviewerRole);

    const session = await this.prisma.questionReviewSession.findUnique({
      where: { id: dto.sessionId },
      select: { id: true, questionId: true, quarter: true, year: true },
    });

    if (!session) {
      throw new NotFoundException('Review session không tồn tại');
    }

    const reviewedAt = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.questionReviewSession.update({
        where: { id: dto.sessionId },
        data: {
          status: dto.status,
          notes: dto.notes?.trim() || null,
          reviewedBy: reviewerId,
          reviewedAt,
        },
        include: {
          reviewer: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await tx.questionReviewAction.create({
        data: {
          sessionId: dto.sessionId,
          status: dto.status,
          notes: dto.notes?.trim() || null,
          reviewedBy: reviewerId,
          reviewedAt,
        },
      });

      return updatedSession;
    });

    return {
      message: 'Review đã được lưu thành công',
      data: updated,
    };
  }

  async resubmitForReview(dto: ResubmitQuestionReviewDto, actorId: string, actorRole: string) {
    const session = await this.prisma.questionReviewSession.findUnique({
      where: { id: dto.sessionId },
      include: {
        question: {
          select: { creatorId: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Review session không tồn tại');
    }

    const isOwner = session.question.creatorId === actorId;
    if (!isOwner && actorRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ người tạo câu hỏi hoặc quản trị viên mới được gửi duyệt lại');
    }

    if (session.status !== QuestionReviewStatus.NEEDS_REVISION) {
      throw new BadRequestException('Chỉ câu hỏi đang ở trạng thái Cần sửa mới có thể gửi duyệt lại');
    }

    const reviewedAt = new Date();
    const notes = dto.notes?.trim() || 'Tác giả đã chỉnh sửa và gửi duyệt lại';

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.questionReviewSession.update({
        where: { id: dto.sessionId },
        data: {
          status: QuestionReviewStatus.RESUBMITTED,
          notes,
          reviewedBy: actorId,
          reviewedAt,
        },
        include: {
          reviewer: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await tx.questionReviewAction.create({
        data: {
          sessionId: dto.sessionId,
          status: QuestionReviewStatus.RESUBMITTED,
          notes,
          reviewedBy: actorId,
          reviewedAt,
        },
      });

      return updatedSession;
    });

    return {
      message: 'Đã gửi duyệt lại thành công',
      data: updated,
    };
  }

  private getQuarter(date: Date): number {
    return Math.floor(date.getMonth() / 3) + 1;
  }

  private getQuarterDateRange(quarter: number, year: number) {
    const startMonth = (quarter - 1) * 3;
    const startDate = new Date(year, startMonth, 1, 0, 0, 0, 0);
    const endDate = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);

    return { startDate, endDate };
  }

  private getAcademicYear(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const startYear = month >= 8 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
  }

  private assertQuarter(quarter: number) {
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      throw new BadRequestException('Quarter phải nằm trong khoảng 1-4');
    }
  }
}
