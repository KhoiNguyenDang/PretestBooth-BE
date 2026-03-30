import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PointsService } from '../points/points.service';
import type { ReportProctoringEventDto } from './dto/proctoring.dto';

import type { Prisma } from '@prisma/client';

@Injectable()
export class ProctoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pointsService: PointsService,
  ) {}

  /**
   * Log a proctoring event and apply penalties if threshold is reached
   * Handles EXAM and PRACTICE sessions differently:
   * - EXAM: Immediate termination on TAB_SWITCH
   * - PRACTICE: Exit current session + ban this practice item
   */
  async reportEvent(userId: string, dto: ReportProctoringEventDto) {
    // Find which type of session this is (EXAM or PRACTICE)
    let examSession = await this.prisma.examSession.findFirst({
      where: { id: dto.sessionId },
      include: { booking: true },
    });

    let practiceSession: any = null;
    if (!examSession) {
      practiceSession = await this.prisma.practiceSession.findFirst({
        where: { id: dto.sessionId },
        include: { booking: true },
      });
    }

    const session = examSession || practiceSession;
    if (!session) throw new NotFoundException('Phiên làm bài không tồn tại (EXAM hoặc PRACTICE)');
    if (session.userId !== userId) throw new ForbiddenException('Bạn không có quyền báo cáo cho phiên này');

    const isExamSession = !!examSession;
    const isPracticeSession = !!practiceSession;

    // Special handling for TAB_SWITCH on PRACTICE sessions
    if (isPracticeSession && dto.eventType === 'TAB_SWITCH') {
      return await this.handlePracticeTabSwitch(practiceSession as any, userId);
    }

    // Special handling for TAB_SWITCH on EXAM sessions
    if (isExamSession && dto.eventType === 'TAB_SWITCH') {
      return await this.handleExamTabSwitch(examSession as any, userId);
    }

    // For other events, continue with normal proctoring logic
    let warningLevel = 1;
    if (dto.eventType === 'COPY_PASTE') warningLevel = 2;
    if (dto.eventType === 'MULTIPLE_FACES') warningLevel = 3;

    // Save event with appropriate session reference
    const eventData: any = {
      user: {
        connect: { id: userId },
      },
      eventType: dto.eventType,
      warningLevel,
      metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
    };
    if (isExamSession) eventData.examSessionId = examSession!.id;
    if (isPracticeSession) eventData.practiceSessionId = practiceSession!.id;

    const event = await this.prisma.proctoringEvent.create({
      data: eventData,
    });

    // Check total severity for this session
    const whereClause: any = isExamSession
      ? { examSessionId: examSession!.id }
      : { practiceSessionId: practiceSession!.id };
      
    const allEvents = await this.prisma.proctoringEvent.findMany({
      where: whereClause,
    });

    const totalSeverity = allEvents.reduce((sum, e) => sum + e.warningLevel, 0);

    // Business Logic for Penalties (Thresholds)
    let actionTaken = 'LOGGED';

    if (isExamSession && totalSeverity >= 10 && examSession.status === 'IN_PROGRESS') {
      // Threshold 3: Cancel exam
      await this.prisma.examSession.update({
        where: { id: examSession.id },
        data: {
          status: 'SUBMITTED', // Force submit
          finishedAt: new Date(),
          score: 0, // Zero score for cheating
        },
      });

      // Heavy point penalty
      await this.pointsService.addTransaction(
        userId,
        'EXAM_CANCELLED_PENALTY',
        -20,
        `Bài thi bị hủy do vi phạm quy chế nghiêm trọng (${totalSeverity} điểm cảnh báo)`,
        { examSessionId: examSession.id },
      );

      actionTaken = 'EXAM_CANCELLED';
    } 
    else if (isExamSession && totalSeverity >= 5 && totalSeverity < 10 && warningLevel > 1) {
      // Threshold 2: Mild point penalty per major infraction after 5
      await this.pointsService.addTransaction(
        userId,
        'PROCTORING_WARNING',
        -2,
        `Trừ điểm do vi phạm quy chế thi (${dto.eventType})`,
        { examSessionId: examSession.id },
      );
      actionTaken = 'POINT_PENALTY';
    }

    return {
      eventId: event.id,
      totalSeverity,
      actionTaken,
    };
  }

  /**
   * Handle TAB_SWITCH for EXAM sessions: Immediate termination
   */
  private async handleExamTabSwitch(examSession: any, userId: string) {
    // Immediately terminate exam due to TAB_SWITCH violation
    await this.prisma.examSession.update({
      where: { id: examSession.id },
      data: {
        status: 'SUBMITTED',
        finishedAt: new Date(),
        score: 0, // Zero score for cheating
      },
    });

    // Create violation event
    const examTabSwitchEventData: any = {
      userId,
      examSessionId: examSession.id,
      eventType: 'TAB_SWITCH',
      warningLevel: 10, // Immediate termination
      metadata: { reason: 'Học sinh chuyển tab trong kỳ thi' } as Prisma.InputJsonValue,
    };

    const event = await this.prisma.proctoringEvent.create({
      data: examTabSwitchEventData,
    });

    // Deduct points for exam violation
    await this.pointsService.addTransaction(
      userId,
      'EXAM_CANCELLED_PENALTY',
      -20,
      'Bài thi bị hủy do chuyển tab/rời khỏi màn hình thi',
      { examSessionId: examSession.id },
    );

    return {
      eventId: event.id,
      actionTaken: 'EXAM_TERMINATED_TAB_SWITCH',
      sessionType: 'EXAM',
    };
  }

  /**
   * Handle TAB_SWITCH for PRACTICE sessions: Exit + ban this practice session
   */
  private async handlePracticeTabSwitch(practiceSession: any, userId: string) {
    // Terminate practice session
    await this.prisma.practiceSession.update({
      where: { id: practiceSession.id },
      data: {
        status: 'ABANDONED',
        finishedAt: new Date(),
      },
    });

    // Create violation event
    const practiceTabSwitchEventData: any = {
      userId,
      practiceSessionId: practiceSession.id,
      eventType: 'TAB_SWITCH',
      warningLevel: 5,
      metadata: { reason: 'Học sinh chuyển tab trong phiên luyện tập' } as Prisma.InputJsonValue,
    };

    const event = await this.prisma.proctoringEvent.create({
      data: practiceTabSwitchEventData,
    });

    // Deduct points for practice violation
    await this.pointsService.addTransaction(
      userId,
      'PROCTORING_WARNING',
      -5,
      'Bị cấm luyện tập do chuyển tab/rời khỏi màn hình',
      practiceSession.bookingId ? { bookingId: practiceSession.bookingId } : undefined,
    );

    return {
      eventId: event.id,
      actionTaken: 'PRACTICE_TERMINATED_TAB_SWITCH',
      sessionType: 'PRACTICE',
    };
  }

  /**
   * Get proctoring report for a session (Admin/Lecturer only)
   */
  async getSessionReport(sessionId: string, userRole: string) {
    if (!['ADMIN', 'LECTURER'].includes(userRole)) {
      throw new ForbiddenException('Bạn không có quyền xem báo cáo giám thị');
    }

    // Check if it's an exam session
    let events = await this.prisma.proctoringEvent.findMany({
      where: { examSessionId: sessionId },
      orderBy: { timestamp: 'desc' },
    });

    let session: any = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      select: { status: true, score: true, user: { select: { name: true, studentCode: true } } },
    });

    let sessionType = 'EXAM';

    // If no exam session, check practice session
    if (!session) {
      events = await this.prisma.proctoringEvent.findMany({
        where: { practiceSessionId: sessionId },
        orderBy: { timestamp: 'desc' },
      });

      session = await this.prisma.practiceSession.findUnique({
        where: { id: sessionId },
        select: { status: true, score: true, user: { select: { name: true, studentCode: true } } },
      });

      sessionType = 'PRACTICE';
    }

    if (!session) {
      throw new NotFoundException('Phiên làm bài không tồn tại');
    }

    const totalSeverity = events.reduce((sum, e) => sum + e.warningLevel, 0);

    return {
      sessionType,
      session,
      totalEvents: events.length,
      totalSeverity,
      events,
    };
  }
}
