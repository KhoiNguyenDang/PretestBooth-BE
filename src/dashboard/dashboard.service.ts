import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get student-specific dashboard stats
   */
  async getStudentStats(userId: string) {
    const upcomingBookings = await this.prisma.booking.findMany({
      where: {
        userId,
        date: { gte: new Date() },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      orderBy: { startTime: 'asc' },
      take: 5,
      include: { booth: { select: { name: true, location: true } } },
    });

    const [totalBookings, completedBookings] = await Promise.all([
      this.prisma.booking.count({ where: { userId } }),
      this.prisma.booking.count({ where: { userId, status: 'COMPLETED' } }),
    ]);

    return {
      totalBookings,
      completedBookings,
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

    const [totalStudents, activeBooths, todayBookings, totalBooths] = await Promise.all([
      this.prisma.user.count({ where: { role: 'STUDENT' } }),
      this.prisma.booth.count({ where: { status: 'ACTIVE' } }),
      this.prisma.booking.count({ where: { date: today } }),
      this.prisma.booth.count(),
    ]);

    const boothStatusCounts = await this.prisma.booth.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    // Booth utilization today (rough estimate: 10 slots/booth/day)
    const maxBookingsPerBooth = 10;
    const utilizationRaw =
      activeBooths > 0 ? (todayBookings / (activeBooths * maxBookingsPerBooth)) * 100 : 0;
    const boothUtilizationPercent = Math.min(100, Math.round(utilizationRaw));

    return {
      totalStudents,
      totalBooths,
      activeBooths,
      todayBookings,
      boothUtilizationPercent,
      boothStatusCounts,
    };
  }
}
