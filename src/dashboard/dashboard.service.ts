import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get student-specific dashboard stats
   */
  async getStudentStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });
    const studentId = user?.studentProfile?.id;

    // Fetch points from PointAccount (new table)
    const pointAccount = studentId
      ? await this.prisma.pointAccount.findUnique({ where: { studentId } })
      : null;

    const [completedExams, practiceSessions, upcomingBookings, passedPretestCount] = await Promise.all([
      this.prisma.examSession.count({ where: { studentId, status: 'SUBMITTED' } }), // GRADED or SUBMITTED
      this.prisma.practiceSession.count({ where: { studentId, status: 'COMPLETED' } }),
      this.prisma.booking.findMany({
        where: { studentId, date: { gte: new Date() }, status: 'CONFIRM' },
        orderBy: { startTime: 'asc' },
        take: 5,
        include: { booth: { select: { name: true } } },
      }),
      studentId
        ? this.prisma.examSession.count({
            where: {
              studentId,
              isPretestSession: true,
              passed: true,
              resultPublicationStatus: 'PUBLISHED',
            },
          })
        : Promise.resolve(0),
    ]);

    // Calculate accuracy % roughly based on problem submissions
    const [totalSubs, acceptedSubs] = await Promise.all([
      this.prisma.submission.count({ where: { studentId } }),
      this.prisma.submission.count({ where: { studentId, status: 'ACCEPTED' } }),
    ]);

    const accuracy = totalSubs > 0 ? Math.round((acceptedSubs / totalSubs) * 100) : 0;

    return {
      points: pointAccount?.totalPoints || 0,
      completedExams,
      completedPractices: practiceSessions,
      submissionAccuracy: accuracy,
      totalSubmissions: totalSubs,
      upcomingBookings,
      hasPassedPretest: passedPretestCount > 0,
    };
  }

  /**
   * Get admin/lecturer system-wide stats
   */
  async getAdminStats(userRole: string) {
    if (userRole !== 'ADMIN' && userRole !== 'LECTURER') {
      throw new ForbiddenException(
        'Chỉ quản trị viên và giảng viên mới xem được thống kê hệ thống',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalStudents, activeBooths, todayBookings, totalExams, recentEvents] =
      await Promise.all([
        this.prisma.user.count({ where: { role: 'STUDENT', auth: { isLocked: false } } }),
        this.prisma.booth.count({ where: { status: 'ACTIVE' } }),
        this.prisma.booking.count({ where: { date: today } }),
        this.prisma.examSession.count(),
        this.prisma.proctoringEvent.findMany({
          orderBy: { timestamp: 'desc' },
          take: 10,
          include: {
            student: {
              select: {
                studentCode: true,
                user: { select: { name: true } },
              },
            },
            examSession: {
              select: {
                student: { select: { studentCode: true, user: { select: { name: true } } } },
              },
            },
            practiceSession: {
              select: {
                student: {
                  select: {
                    studentCode: true,
                    user: { select: { name: true } },
                  },
                },
              },
            },
          },
        }),
      ]);

    // Booth utilization today
    const maxBookingsPerBooth = 20; // roughly 10 hours * 2 (30 min slots)
    const utilizationRaw =
      activeBooths > 0 ? (todayBookings / (activeBooths * maxBookingsPerBooth)) * 100 : 0;
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
