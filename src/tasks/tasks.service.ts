import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingsService: BookingsService,
  ) {}

  /**
   * Run every day at midnight (00:00)
   * Auto-lock student accounts that are 6+ years past enrollment year
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleAccountAutoLock() {
    this.logger.debug('Running account auto-lock cron job...');

    const currentYear = new Date().getFullYear();
    const students = await this.prisma.user.findMany({
      where: {
        role: 'STUDENT',
        isLocked: false,
        studentCode: { not: null },
      },
    });

    let lockedCount = 0;

    for (const student of students) {
      if (!student.studentCode) continue;

      // Extract enrollment year from first 2 digits of studentCode
      // e.g. "22642441" -> "22" -> 2022
      const enrollmentYearStr = student.studentCode.substring(0, 2);
      const enrollmentYear = 2000 + parseInt(enrollmentYearStr, 10);

      // Lock if elapsed time >= 6 years
      if (currentYear - enrollmentYear >= 6) {
        await this.prisma.user.update({
          where: { id: student.id },
          data: {
            isLocked: true,
            lockedAt: new Date(),
            lockedReason: `Tài khoản tự động khóa: Sinh viên khóa ${enrollmentYear} đã quá 6 năm (từ ${enrollmentYear} đến ${currentYear})`,
          },
        });
        lockedCount++;
        this.logger.log(`Auto-locked student account: ${student.studentCode} (${student.email})`);
      }
    }

    this.logger.debug(`Account auto-lock cron job finished. Locked ${lockedCount} accounts.`);
  }

  /**
   * Run every minute to auto check-out bookings that passed their endTime.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleBookingAutoCheckout() {
    const count = await this.bookingsService.autoCheckOutExpiredBookings();
    if (count > 0) {
      this.logger.log(`Auto checked out ${count} expired booking(s).`);
    }
  }
}
