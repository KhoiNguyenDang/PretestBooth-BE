import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
   * Anti-cheat enforcement is only applied for EXAM sessions.
   */
  async reportEvent(userId: string, dto: ReportProctoringEventDto) {
    // Find which type of session this is (EXAM or PRACTICE)
    const examSession = await this.prisma.examSession.findFirst({
      where: { id: dto.sessionId },
      include: {
        booking: true,
        student: { select: { userId: true, id: true } },
        exam: {
          select: { type: true },
        },
      },
    });

    let practiceSession: any = null;
    if (!examSession) {
      practiceSession = await this.prisma.practiceSession.findFirst({
        where: { id: dto.sessionId },
        include: { booking: true, student: { select: { userId: true, id: true } } },
      });
    }

    const session = examSession || practiceSession;
    if (!session) throw new NotFoundException('Phiên làm bài không tồn tại (EXAM hoặc PRACTICE)');
    if (session.student?.userId !== userId)
      throw new ForbiddenException('Bạn không có quyền báo cáo cho phiên này');

    const isExamSession = !!examSession;
    const isPracticeExamSession = !!examSession && examSession.exam.type === 'PRACTICE';
    const isPracticeSession = !!practiceSession;

    // Practice contexts are not proctored.
    if (isPracticeSession || isPracticeExamSession) {
      return {
        eventId: null,
        totalSeverity: 0,
        actionTaken: 'LOGGED',
      };
    }

    // Special handling for TAB_SWITCH on EXAM sessions: warning only, no forced submit.
    if (isExamSession && dto.eventType === 'TAB_SWITCH') {
      return await this.handleExamTabSwitchWarning(examSession as any, userId, dto.metadata);
    }

    // For other events, continue with normal proctoring logic
    let warningLevel = 1;
    if (dto.eventType === 'COPY_PASTE') warningLevel = 2;
    if (dto.eventType === 'MULTIPLE_FACES') warningLevel = 3;

    // Save event with appropriate session reference
    const eventData: any = {
      studentId: session.student?.id,
      eventType: dto.eventType,
      warningLevel,
      metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
    };
    if (isExamSession) eventData.examSessionId = examSession.id;
    if (isPracticeSession) eventData.practiceSessionId = practiceSession!.id;

    const event = await this.prisma.proctoringEvent.create({
      data: eventData,
    });

    // Check total severity for this session
    const whereClause: any = isExamSession
      ? { examSessionId: examSession.id }
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
        session.student?.id ?? userId,
        'EXAM_CANCELLED_PENALTY',
        -20,
        `Bài thi bị hủy do vi phạm quy chế nghiêm trọng (${totalSeverity} điểm cảnh báo)`,
        { examSessionId: examSession.id },
      );

      actionTaken = 'EXAM_CANCELLED';
    } else if (isExamSession && totalSeverity >= 5 && totalSeverity < 10 && warningLevel > 1) {
      // Threshold 2: Mild point penalty per major infraction after 5
      await this.pointsService.addTransaction(
        session.student?.id ?? userId,
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
   * Handle TAB_SWITCH for EXAM sessions: warning only.
   */
  private async handleExamTabSwitchWarning(examSession: any, userId: string, customMetadata?: any) {
    // Create warning event only. Do not terminate or deduct points.
    const examTabSwitchEventData: any = {
      studentId: examSession.studentId,
      examSessionId: examSession.id,
      eventType: 'TAB_SWITCH',
      warningLevel: 1,
      metadata: {
        reason: 'Học sinh chuyển tab trong kỳ thi',
        ...(customMetadata || {}),
      } as Prisma.InputJsonValue,
    };

    const event = await this.prisma.proctoringEvent.create({
      data: examTabSwitchEventData,
    });

    const totalSeverityResult = await this.prisma.proctoringEvent.aggregate({
      where: { examSessionId: examSession.id },
      _sum: { warningLevel: true },
    });

    return {
      eventId: event.id,
      totalSeverity: totalSeverityResult._sum.warningLevel || 0,
      actionTaken: 'LOGGED',
      sessionType: 'EXAM',
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
      select: {
        status: true,
        score: true,
        student: {
          select: {
            studentCode: true,
            user: { select: { name: true } },
          },
        },
      },
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
        select: {
          status: true,
          score: true,
          student: {
            select: {
              studentCode: true,
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      sessionType = 'PRACTICE';
    }

    if (!session) {
      throw new NotFoundException('Phiên làm bài không tồn tại');
    }

    session = {
      ...session,
      user: {
        name: session.student?.user?.name ?? null,
        studentCode: session.student?.studentCode ?? null,
      },
    };

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
