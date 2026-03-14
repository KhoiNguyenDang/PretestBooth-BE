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
   */
  async reportEvent(userId: string, dto: ReportProctoringEventDto) {
    const session = await this.prisma.examSession.findUnique({
      where: { id: dto.sessionId },
    });

    if (!session) throw new NotFoundException('Phiên thi không tồn tại');
    if (session.userId !== userId) throw new ForbiddenException('Bạn không có quyền báo cáo cho phiên này');

    // Simple risk weighting algorithm
    let warningLevel = 1;
    if (dto.eventType === 'COPY_PASTE') warningLevel = 2;
    if (dto.eventType === 'MULTIPLE_FACES') warningLevel = 3;

    // Save event
    const event = await this.prisma.proctoringEvent.create({
      data: {
        sessionId: session.id,
        eventType: dto.eventType,
        warningLevel,
        metadata: (dto.metadata || {}) as Prisma.InputJsonValue,
      },
    });

    // Check total severity for this session
    const allEvents = await this.prisma.proctoringEvent.findMany({
      where: { sessionId: session.id },
    });

    const totalSeverity = allEvents.reduce((sum, e) => sum + e.warningLevel, 0);

    // Business Logic for Penalties (Thresholds)
    let actionTaken = 'LOGGED';

    if (totalSeverity >= 10 && session.status === 'IN_PROGRESS') {
      // Threshold 3: Cancel exam
      await this.prisma.examSession.update({
        where: { id: session.id },
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
        { examSessionId: session.id },
      );

      actionTaken = 'EXAM_CANCELLED';
    } 
    else if (totalSeverity >= 5 && totalSeverity < 10 && warningLevel > 1) {
      // Threshold 2: Mild point penalty per major infraction after 5
      await this.pointsService.addTransaction(
        userId,
        'PROCTORING_WARNING',
        -2,
        `Trừ điểm do vi phạm quy chế thi (${dto.eventType})`,
        { examSessionId: session.id },
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
   * Get proctoring report for a session (Admin/Lecturer only)
   */
  async getSessionReport(sessionId: string, userRole: string) {
    if (!['ADMIN', 'LECTURER'].includes(userRole)) {
      throw new ForbiddenException('Bạn không có quyền xem báo cáo giám thị');
    }

    const events = await this.prisma.proctoringEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'desc' },
    });

    const session = await this.prisma.examSession.findUnique({
      where: { id: sessionId },
      select: { status: true, score: true, user: { select: { name: true, studentCode: true } } },
    });

    const totalSeverity = events.reduce((sum, e) => sum + e.warningLevel, 0);

    return {
      session,
      totalEvents: events.length,
      totalSeverity,
      events,
    };
  }
}
