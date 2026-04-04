import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';
import { PointsService } from '../points/points.service';
import type { Prisma } from '@prisma/client';
import type { CreatePracticeSessionDto, SubmitPracticeAnswerDto } from './dto/practice.dto';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
    private readonly pointsService: PointsService,
    private readonly authorizationService: AuthorizationService,
    private readonly realtimeService: RealtimeService,
  ) {}

  private async assertMonitoringPermission(userId: string, userRole: string, actionLabel: string) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (userRole !== 'LECTURER') {
      throw new ForbiddenException(`Chỉ giảng viên và quản trị viên mới có thể ${actionLabel}`);
    }

    await this.authorizationService.assertPermission(
      userId,
      userRole,
      'MONITOR_SESSIONS',
      'Giảng viên chưa được cấp quyền giám sát phiên thi/booth',
    );
  }

  private calculatePracticeCompletionPoints(score: number, maxScore: number | null): number {
    if (!maxScore || maxScore <= 0) {
      return 2;
    }

    const ratio = Math.max(0, Math.min(1, score / maxScore));
    // Formula: 2 + 8 * performance ratio, rounded to integer and capped to [2, 10]
    const computed = Math.round(2 + 8 * ratio);
    return Math.max(2, Math.min(10, computed));
  }

  /**
   * Auto-generate a new practice session based on student config
   */
  async createSession(userId: string, dto: CreatePracticeSessionDto) {
    const activeBooking = await this.bookingsService.findActiveCheckedInBooking(
      userId,
      'PRACTICE',
    );

    // 1. Fetch eligible items
    if (!dto.includeQuestions && !dto.includeProblems) {
      throw new BadRequestException('Phải chọn ít nhất một loại bài tập');
    }

    const questionWhere: Prisma.QuestionWhereInput = {
      isPublished: true,
      classification: 'PRACTICE',
    };
    const problemWhere: Prisma.ProblemWhereInput = { isPublished: true };

    if (dto.difficulty) {
      questionWhere.difficulty = dto.difficulty;
      problemWhere.difficulty = dto.difficulty;
    }

    if (dto.subjectId) {
      questionWhere.subjectId = dto.subjectId;
      problemWhere.subjectId = dto.subjectId;
    }

    if (dto.topicId) {
      questionWhere.topicId = dto.topicId;
      problemWhere.topicId = dto.topicId;
    }

    if (dto.categoryId) {
      questionWhere.categoryId = dto.categoryId;
      problemWhere.categoryId = dto.categoryId;
    }

    let questionsToPick: any[] = [];
    let problemsToPick: any[] = [];

    // Optimize later with raw SQL TABLESAMPLE, now doing app-level random for small datasets
    if (dto.includeQuestions) {
      const allQs = await this.prisma.question.findMany({ where: questionWhere, select: { id: true } });
      questionsToPick = allQs.sort(() => 0.5 - Math.random()).slice(0, dto.includeProblems ? Math.ceil(dto.totalItems * 0.8) : dto.totalItems);
    }

    if (dto.includeProblems) {
      const remainingCount = dto.totalItems - questionsToPick.length;
      if (remainingCount > 0) {
        const allPs = await this.prisma.problem.findMany({ where: problemWhere, select: { id: true } });
        problemsToPick = allPs.sort(() => 0.5 - Math.random()).slice(0, remainingCount);
      }
    }

    const totalActualItems = questionsToPick.length + problemsToPick.length;
    if (totalActualItems === 0) {
      throw new BadRequestException('Không tìm thấy câu hỏi nào phù hợp với điều kiện');
    }

    // 2. Create the session
    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.practiceSession.create({
        data: {
          userId,
          bookingId: activeBooking?.id ?? null,
          duration: dto.duration,
          totalItems: totalActualItems,
          difficulty: dto.difficulty,
          subjectId: dto.subjectId,
          topicId: dto.topicId,
          categoryId: dto.categoryId,
          status: 'IN_PROGRESS',
        },
      });

      // 3. Create items
      const itemsToCreate: any[] = [];
      let order = 1;

      for (const q of questionsToPick) {
        itemsToCreate.push({
          sessionId: session.id,
          questionId: q.id,
          order: order++,
          points: 1,
        });
      }

      for (const p of problemsToPick) {
        itemsToCreate.push({
          sessionId: session.id,
          problemId: p.id,
          order: order++,
          points: 5, // Default weight for problems
        });
      }

      await tx.practiceSessionItem.createMany({ data: itemsToCreate });

      // Calculate max score
      const totalScore = itemsToCreate.reduce((sum, item) => sum + item.points, 0);
      await tx.practiceSession.update({
        where: { id: session.id },
        data: { maxScore: totalScore },
      });

      return { sessionId: session.id, totalItems: totalActualItems };
    });

    this.realtimeService.monitoringUpdated({
      scope: 'PRACTICE',
      action: 'START',
      bookingId: activeBooking?.id,
      boothId: activeBooking?.boothId,
      userId,
      sessionType: 'PRACTICE',
      sessionId: created.sessionId,
      emittedAt: new Date().toISOString(),
    });

    return created;
  }

  /**
   * Get an ongoing or past practice session with all its items
   */
  async getSession(sessionId: string, userId: string) {
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: {
            question: {
              include: { choices: { select: { id: true, content: true, order: true } } }, // Don't expose isCorrect
            },
            problem: { select: { id: true, title: true, description: true, inputTypes: true, outputType: true, argNames: true, functionName: true, constraints: true, timeLimit: true, memoryLimit: true } },
            answers: true, // Previous answers if any
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Phiên luyện tập không tồn tại');
    if (session.userId !== userId) throw new ForbiddenException('Bạn không có quyền truy cập phiên này');

    // Shuffle choices for MC questions deterministically or randomly (for practice let's just use random for now or keep original order)
    (session as any).items.forEach(item => {
      if (item.question && item.question.choices) {
        item.question.choices.sort(() => 0.5 - Math.random());
      }
    });

    return session;
  }

  /**
   * Submit an answer for a single item (can be called repeatedly)
   */
  async submitAnswer(sessionId: string, userId: string, dto: SubmitPracticeAnswerDto) {
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Phiên luyện tập không tồn tại');
    if (session.userId !== userId) throw new ForbiddenException('Bạn không có quyền truy cập phiên này');
    if (session.status !== 'IN_PROGRESS') throw new BadRequestException('Phiên luyện tập đã kết thúc');

    // Check time limit
    const now = new Date();
    const expiryDate = new Date(session.startedAt);
    expiryDate.setMinutes(expiryDate.getMinutes() + session.duration);
    
    // Add 1 min grace period
    expiryDate.setMinutes(expiryDate.getMinutes() + 1);

    if (now > expiryDate) {
      // Auto complete the session
      await this.completeSession(sessionId, userId);
      throw new BadRequestException('Đã hết thời gian luyện tập');
    }

    const item = await this.prisma.practiceSessionItem.findUnique({
      where: { id: dto.itemId },
    });

    if (!item || item.sessionId !== sessionId) {
      throw new NotFoundException('Câu hỏi không thuộc phiên này');
    }

    // Upsert the answer
    return this.prisma.practiceSessionAnswer.upsert({
      where: { itemId: dto.itemId },
      create: {
        itemId: dto.itemId,
        selectedChoiceIds: dto.selectedChoiceIds || [],
        textAnswer: dto.textAnswer,
        sourceCode: dto.sourceCode,
        language: dto.language,
        languageVersion: dto.version,
      },
      update: {
        selectedChoiceIds: dto.selectedChoiceIds || [],
        textAnswer: dto.textAnswer,
        sourceCode: dto.sourceCode,
        language: dto.language,
        languageVersion: dto.version,
      },
    });
  }

  /**
   * Finish and grade the practice session
   */
  async completeSession(sessionId: string, userId: string) {
    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        items: {
          include: {
            question: { include: { choices: true } },
            answers: true,
          },
        },
      },
    });

    if (!session) throw new NotFoundException('Phiên luyện tập không tồn tại');
    if (session.userId !== userId) throw new ForbiddenException('Bạn không có quyền truy cập phiên này');
    if (session.status !== 'IN_PROGRESS') return session; // Already completed

    let totalScore = 0;

    // Grade MC and Short Answers (Problems require full execution, so they stay Ungraded for now)
    for (const item of session.items) {
      if (!item.answers) continue; // Unanswered
      const answer = item.answers;

      if (item.questionId && item.question) {
        let isCorrect = false;

        if (item.question.questionType === 'SINGLE_CHOICE' || item.question.questionType === 'MULTIPLE_CHOICE') {
          const correctChoiceIds = item.question.choices.filter(c => c.isCorrect).map(c => c.id);
          const selectedChoiceIds = answer.selectedChoiceIds || [];
          
          isCorrect = 
            correctChoiceIds.length > 0 && 
            correctChoiceIds.length === selectedChoiceIds.length &&
            correctChoiceIds.every(id => selectedChoiceIds.includes(id));
        } else if (item.question.questionType === 'SHORT_ANSWER') {
          // Case-insensitive exact match
          const expected = item.question.correctAnswer?.trim().toLowerCase() || '';
          const actual = answer.textAnswer?.trim().toLowerCase() || '';
          isCorrect = expected === actual && expected !== '';
        }

        const score = isCorrect ? item.points : 0;
        totalScore += score;

        await this.prisma.practiceSessionAnswer.update({
          where: { id: answer.id },
          data: { isCorrect, score },
        });

        // Update question telemetry (usage count)
        await this.prisma.question.update({
          where: { id: item.questionId },
          data: { usageCount: { increment: 1 } }
        });
      }
    }

    const updatedSession = await this.prisma.practiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        score: totalScore,
      },
    });

    const practicePoints = this.calculatePracticeCompletionPoints(totalScore, session.maxScore);
    
    // Get booking ID from practice session via session fetch
    const practiceSessionWithBooking = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      select: {
        bookingId: true,
        booking: {
          select: {
            boothId: true,
          },
        },
      },
    });

    if (practiceSessionWithBooking?.bookingId) {
      const existing = await this.prisma.pointTransaction.findFirst({
        where: {
          userId,
          type: 'PRACTICE_ATTENDANCE',
          bookingId: practiceSessionWithBooking.bookingId,
        },
        select: { id: true },
      });

      if (!existing) {
        await this.pointsService.addTransaction(
          userId,
          'PRACTICE_ATTENDANCE',
          practicePoints,
          `Hoàn thành luyện tập: ${totalScore}/${session.maxScore ?? 0}`,
          { bookingId: practiceSessionWithBooking.bookingId },
        );
      }
    }

    const emittedAt = new Date().toISOString();

    this.realtimeService.sessionTerminated({
      sessionType: 'PRACTICE',
      sessionId,
      userId,
      boothId: practiceSessionWithBooking?.booking?.boothId || undefined,
      status: 'COMPLETED',
      emittedAt,
    });

    this.realtimeService.monitoringUpdated({
      scope: 'PRACTICE',
      action: 'SUBMIT',
      bookingId: practiceSessionWithBooking?.bookingId || undefined,
      boothId: practiceSessionWithBooking?.booking?.boothId || undefined,
      userId,
      sessionType: 'PRACTICE',
      sessionId,
      emittedAt,
    });

    return updatedSession;
  }

  async extendSessionByMonitor(
    sessionId: string,
    minutes: number,
    reason: string,
    requesterId: string,
    requesterRole: string,
  ) {
    await this.assertMonitoringPermission(requesterId, requesterRole, 'gia hạn phiên luyện tập');

    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        booking: {
          select: {
            boothId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Phiên luyện tập không tồn tại');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Phiên luyện tập không còn ở trạng thái IN_PROGRESS');
    }

    const nextDuration = session.duration + minutes;
    if (nextDuration > 720) {
      throw new BadRequestException('Tổng thời lượng sau gia hạn không được vượt quá 720 phút');
    }

    await this.prisma.practiceSession.update({
      where: { id: sessionId },
      data: {
        duration: nextDuration,
      },
    });

    const nextExpiresAt = new Date(session.startedAt.getTime() + nextDuration * 60 * 1000);
    const emittedAt = new Date().toISOString();

    this.realtimeService.sessionTimerAdjusted({
      sessionType: 'PRACTICE',
      sessionId,
      userId: session.userId,
      boothId: session.booking?.boothId || undefined,
      expiresAt: nextExpiresAt.toISOString(),
      reason,
      emittedAt,
    });

    this.realtimeService.monitoringUpdated({
      scope: 'PRACTICE',
      action: 'EXTEND',
      userId: session.userId,
      boothId: session.booking?.boothId || undefined,
      sessionType: 'PRACTICE',
      sessionId,
      bookingId: session.bookingId || undefined,
      emittedAt,
    });

    return {
      sessionId,
      sessionType: 'PRACTICE',
      previousDuration: session.duration,
      duration: nextDuration,
      expiresAt: nextExpiresAt,
      extendedMinutes: minutes,
      reason,
      updatedBy: requesterId,
    };
  }

  async abortSessionByMonitor(
    sessionId: string,
    reason: string,
    requesterId: string,
    requesterRole: string,
  ) {
    await this.assertMonitoringPermission(requesterId, requesterRole, 'hủy phiên luyện tập');

    const session = await this.prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        booking: {
          select: {
            boothId: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Phiên luyện tập không tồn tại');
    }

    if (session.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Phiên luyện tập không còn ở trạng thái IN_PROGRESS');
    }

    await this.prisma.practiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'ABANDONED',
        finishedAt: new Date(),
      },
    });

    const emittedAt = new Date().toISOString();

    this.realtimeService.sessionTerminated({
      sessionType: 'PRACTICE',
      sessionId,
      userId: session.userId,
      boothId: session.booking?.boothId || undefined,
      status: 'ABANDONED',
      reason,
      emittedAt,
    });

    this.realtimeService.monitoringUpdated({
      scope: 'PRACTICE',
      action: 'ABORT',
      userId: session.userId,
      boothId: session.booking?.boothId || undefined,
      sessionType: 'PRACTICE',
      sessionId,
      bookingId: session.bookingId || undefined,
      emittedAt,
    });

    this.realtimeService.notify({
      userId: session.userId,
      boothId: session.booking?.boothId || undefined,
      message: `Phiên luyện tập đã bị hủy bởi quản trị viên/giảng viên. Lý do: ${reason}`,
      level: 'error',
      emittedAt,
    });

    return {
      message: 'Hủy phiên luyện tập thành công',
      sessionId,
      reason,
      updatedBy: requesterId,
    };
  }
}
