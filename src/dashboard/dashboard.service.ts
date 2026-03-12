import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get student-specific dashboard stats
   */
  async getStudentStats(userId: string) {
    const [
      totalPoints,
      completedExams,
      practiceSessions,
      upcomingBookings,
    ] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { totalPoints: true } }),
      this.prisma.examSession.count({ where: { userId, status: 'SUBMITTED' } }), // GRADED or SUBMITTED
      this.prisma.practiceSession.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.booking.findMany({
        where: { userId, date: { gte: new Date() }, status: { in: ['CONFIRMED', 'PENDING'] } },
        orderBy: { startTime: 'asc' },
        take: 5,
        include: { booth: { select: { name: true } } },
      }),
    ]);

    // Calculate accuracy % roughly based on problem submissions
    const [totalSubs, acceptedSubs] = await Promise.all([
      this.prisma.submission.count({ where: { userId } }),
      this.prisma.submission.count({ where: { userId, status: 'ACCEPTED' } }),
    ]);

    const accuracy = totalSubs > 0 ? Math.round((acceptedSubs / totalSubs) * 100) : 0;

    return {
      points: totalPoints?.totalPoints || 0,
      completedExams,
      completedPractices: practiceSessions,
      submissionAccuracy: accuracy,
      totalSubmissions: totalSubs,
      upcomingBookings,
    };
  }

  /**
   * Get admin system-wide stats
   */
  async getAdminStats(userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới xem được thống kê hệ thống');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalStudents,
      activeBooths,
      todayBookings,
      totalExams,
      recentEvents,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT', isLocked: false } }),
      this.prisma.booth.count({ where: { status: 'ACTIVE' } }),
      this.prisma.booking.count({ where: { date: today } }),
      this.prisma.examSession.count(),
      this.prisma.proctoringEvent.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: { session: { select: { user: { select: { name: true, studentCode: true } } } } },
      }),
    ]);

    // Booth utilization today
    const maxBookingsPerBooth = 20; // roughly 10 hours * 2 (30 min slots)
    const utilizationRaw = activeBooths > 0 ? (todayBookings / (activeBooths * maxBookingsPerBooth)) * 100 : 0;
    const utilization = Math.min(100, Math.round(utilizationRaw));

    return {
      totalStudents,
      activeBooths,
      todayBookings,
      totalExams,
      boothUtilizationPercent: utilization,
      recentProctoringEvents: recentEvents,
    };
  }
}
