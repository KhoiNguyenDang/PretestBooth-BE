import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoothsService } from '../booths/booths.service';
import type { CreateBookingDto, QueryBookingDto } from './dto/booking.dto';
import type { Prisma, BookingStatus, BookingType } from '@prisma/client';
import { RealtimeService } from '../realtime/realtime.service';
import { PointsService } from '../points/points.service';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boothsService: BoothsService,
    private readonly realtimeService: RealtimeService,
    private readonly pointsService: PointsService,
  ) {}

  private getCheckInEarlyMinutes() {
    return Number(process.env.CHECKIN_EARLY_MINUTES || 15);
  }

  private getCheckInLateMinutes() {
    return Number(process.env.CHECKIN_LATE_MINUTES || 0);
  }

  private isWithinAutoCheckInWindow(startTime: Date, endTime: Date, now: Date) {
    const earliestCheckIn = new Date(startTime.getTime() - this.getCheckInEarlyMinutes() * 60 * 1000);
    const latestCheckIn = new Date(endTime.getTime() + this.getCheckInLateMinutes() * 60 * 1000);

    return now >= earliestCheckIn && now <= latestCheckIn;
  }

  // Project convention: booking/check-in timestamps are being stored/handled as Vietnam local wall-clock.
  // Keep runtime "now" aligned with that convention to avoid -7h mismatches during comparisons.
  private getNowInVietnamConvention() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000);
  }

  private formatUtcDateTime(date: Date) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }

  private formatVnDateTime(date: Date) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  }

  /**
   * Create a booking with full business rule validation:
   * - Must book at least 7 days in advance
   * - Time slot must be within 7:00 - 17:00
    * - Duration must be in admin-configured options (stored in DB)
   * - 15 min gap between consecutive sessions for same student
   * - Cannot exceed active booth count at any time slot
   * - Student account must be active (not locked)
   */
  async create(userId: string, userRole: string, dto: CreateBookingDto) {
    if (userRole !== 'STUDENT') {
      throw new ForbiddenException('Chỉ sinh viên mới có thể đặt lịch sử dụng booth');
    }

    // Check if account is locked
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (user.isLocked) {
      throw new ForbiddenException('Tài khoản đã bị khóa, không thể đặt lịch');
    }

    const bookingDate = new Date(dto.date);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const now = this.getNowInVietnamConvention();

    // Rule 1: Must book at least 7 days in advance
    const minBookingDate = new Date(now);
    minBookingDate.setDate(minBookingDate.getDate() + 7);
    minBookingDate.setHours(0, 0, 0, 0);

    if (bookingDate < minBookingDate) {
      throw new BadRequestException('Phải đăng ký trước tối thiểu 1 tuần');
    }

    // Rule 2: Time slot must be within 7:00 - 17:00 (Vietnam Time +07)
    const startVNTimeOffset = startTime.getTime() + (7 * 60 * 60 * 1000);
    const startVNDate = new Date(startVNTimeOffset);
    const startHour = startVNDate.getUTCHours();
    
    const endVNTimeOffset = endTime.getTime() + (7 * 60 * 60 * 1000);
    const endVNDate = new Date(endVNTimeOffset);
    const endHour = endVNDate.getUTCHours();
    const endMinute = endVNDate.getUTCMinutes();

    if (startHour < 7 || (endHour > 17 || (endHour === 17 && endMinute > 0))) {
      throw new BadRequestException('Khung giờ sử dụng booth: 7:00 - 17:00');
    }

    // Rule 3: Duration must be in admin-configured options
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMin = durationMs / (1000 * 60);

    if (durationMs <= 0) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    }

    if (!Number.isInteger(durationMin)) {
      throw new BadRequestException('Thời lượng phải theo đơn vị phút');
    }

    const allowedDuration = await this.prisma.bookingDurationOption.findFirst({
      where: {
        type: dto.type,
        durationMinutes: durationMin,
        isActive: true,
      },
    });

    if (!allowedDuration) {
      const options = await this.prisma.bookingDurationOption.findMany({
        where: {
          type: dto.type,
          isActive: true,
        },
        orderBy: [{ displayOrder: 'asc' }, { durationMinutes: 'asc' }],
        select: { durationMinutes: true },
      });

      if (options.length === 0) {
        throw new BadRequestException(
          `Hiện chưa có cấu hình thời lượng khả dụng cho loại ${dto.type}. Vui lòng liên hệ quản trị viên.`,
        );
      }

      const optionText = options.map((item) => `${item.durationMinutes} phút`).join(', ');
      throw new BadRequestException(
        `Thời lượng không hợp lệ cho ${dto.type}. Các mốc hiện có: ${optionText}.`,
      );
    }

    // Rule 4: 15 min gap between consecutive sessions
    const fifteenMinMs = 15 * 60 * 1000;
    const gapCheckStart = new Date(startTime.getTime() - fifteenMinMs);
    const gapCheckEnd = new Date(endTime.getTime() + fifteenMinMs);

    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        userId,
        date: bookingDate,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        OR: [
          { startTime: { lt: gapCheckEnd }, endTime: { gt: gapCheckStart } },
        ],
      },
    });

    if (conflictingBookings.length > 0) {
      throw new ConflictException(
        'Mỗi lần sử dụng booth phải cách nhau tối thiểu 15 phút. Bạn đã có lịch trùng hoặc quá gần.',
      );
    }

    // Rule 5: Check booth availability (concurrent bookings < active booths)
    const booth = await this.prisma.booth.findUnique({ where: { id: dto.boothId } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');
    if (booth.status !== 'ACTIVE') {
      throw new BadRequestException('Booth hiện không hoạt động');
    }

    // Check if this specific booth is already booked at this time
    const boothConflict = await this.prisma.booking.findFirst({
      where: {
        boothId: dto.boothId,
        date: bookingDate,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (boothConflict) {
      throw new ConflictException('Booth này đã được đặt trong khung giờ này');
    }

    // Also check total concurrent bookings don't exceed active booth count
    const activeBoothCount = await this.boothsService.getActiveBoothCount();
    const concurrentBookings = await this.prisma.booking.count({
      where: {
        date: bookingDate,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (concurrentBookings >= activeBoothCount) {
      throw new ConflictException(
        `Tất cả ${activeBoothCount} booth đều đã được đặt trong khung giờ này`,
      );
    }

    // Create the booking
    return this.prisma.booking.create({
      data: {
        userId,
        boothId: dto.boothId,
        type: dto.type as BookingType,
        date: bookingDate,
        startTime,
        endTime,
        status: 'CONFIRMED',
      },
      include: {
        booth: { select: { id: true, name: true, location: true } },
      },
    });
  }

  /**
   * List bookings (students see their own, admin/lecturer see all)
   */
  async findAll(userId: string, userRole: string, query: QueryBookingDto) {
    const { page, limit, status, type, date, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {};

    if (userRole === 'STUDENT') {
      where.userId = userId;
    }

    if (status) where.status = status as BookingStatus;
    if (type) where.type = type as BookingType;
    if (date) where.date = new Date(date);

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: sortOrder },
        include: {
          booth: { select: { id: true, name: true, location: true } },
          user: { select: { id: true, email: true, name: true, studentCode: true } },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data: bookings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get availability for a specific date
   */
  async getAvailability(dateStr: string) {
    const date = new Date(dateStr);
    const activeBooths = await this.prisma.booth.findMany({
      where: { status: 'ACTIVE' },
    });

    // Get all bookings for this date
    const bookings = await this.prisma.booking.findMany({
      where: {
        date,
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
      },
      include: {
        booth: { select: { id: true, name: true } },
      },
      orderBy: { startTime: 'asc' },
    });

    // Generate time slots (7:00 - 17:00, 30-min intervals)
    const slots: any[] = [];
    for (let hour = 7; hour < 17; hour++) {
      for (const minute of [0, 30]) {
        // Enforce VN timezone (+07:00) so that slot times are inherently timezone-independent
        const isoStringStart = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00.000+07:00`;
        const slotStart = new Date(isoStringStart);
        
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

        const booked = bookings.filter(
          (b) => b.startTime < slotEnd && b.endTime > slotStart,
        );

        slots.push({
          startTime: slotStart.toISOString(),
          endTime: slotEnd.toISOString(),
          totalBooths: activeBooths.length,
          bookedBooths: booked.length,
          availableBooths: activeBooths.length - booked.length,
          bookedBoothIds: booked.map((b) => b.boothId),
        });
      }
    }

    return { date: date.toISOString(), booths: activeBooths, slots };
  }

  /**
   * Cancel a booking
   */
  async cancel(bookingId: string, userId: string, userRole: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (userRole === 'STUDENT' && booking.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền hủy booking này');
    }

    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw new BadRequestException('Không thể hủy booking ở trạng thái này');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' },
    });
  }

  async autoCheckInByBooth(userId: string, boothId: string) {
    const now = this.getNowInVietnamConvention();
    const earlyMs = this.getCheckInEarlyMinutes() * 60 * 1000;
    const lateMs = this.getCheckInLateMinutes() * 60 * 1000;

    const candidates = await this.prisma.booking.findMany({
      where: {
        userId,
        boothId,
        type: { in: ['EXAM', 'PRACTICE'] },
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        startTime: { lte: new Date(now.getTime() + earlyMs) },
        endTime: { gte: new Date(now.getTime() - lateMs) },
      },
      orderBy: { startTime: 'asc' },
    });

    const booking = candidates
      .filter((item) => this.isWithinAutoCheckInWindow(item.startTime, item.endTime, now))
      .sort(
        (a, b) =>
          Math.abs(a.startTime.getTime() - now.getTime()) -
          Math.abs(b.startTime.getTime() - now.getTime()),
      )[0];

    if (!booking) {
      const windowBookings = await this.prisma.booking.findMany({
        where: {
          userId,
          type: { in: ['EXAM', 'PRACTICE'] },
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          startTime: { lte: new Date(now.getTime() + earlyMs) },
          endTime: { gte: new Date(now.getTime() - lateMs) },
        },
        include: {
          booth: { select: { id: true, name: true, code: true } },
        },
        orderBy: { startTime: 'asc' },
      });

      if (windowBookings.length > 0) {
        const nearest = windowBookings.sort(
          (a, b) =>
            Math.abs(a.startTime.getTime() - now.getTime()) -
            Math.abs(b.startTime.getTime() - now.getTime()),
        )[0];

        const currentBooth = await this.prisma.booth.findUnique({
          where: { id: boothId },
          select: { name: true, code: true },
        });

        const bookedBoothLabel = `${nearest.booth.name}${nearest.booth.code ? ` (${nearest.booth.code})` : ''}`;
        const currentBoothLabel = currentBooth
          ? `${currentBooth.name}${currentBooth.code ? ` (${currentBooth.code})` : ''}`
          : boothId;

        throw new ForbiddenException(
          `Bạn đang đăng nhập tại ${currentBoothLabel}, nhưng lịch hợp lệ hiện tại thuộc ${bookedBoothLabel}. Vui lòng đến đúng booth đã đặt.`,
        );
      }

      const upcomingSameBooth = await this.prisma.booking.findFirst({
        where: {
          userId,
          boothId,
          type: { in: ['EXAM', 'PRACTICE'] },
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          endTime: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { startTime: 'asc' },
      });

      if (upcomingSameBooth) {
        const startLabel = this.formatUtcDateTime(upcomingSameBooth.startTime);
        const endLabel = this.formatUtcDateTime(upcomingSameBooth.endTime);
        const startLabelVn = this.formatVnDateTime(upcomingSameBooth.startTime);
        const endLabelVn = this.formatVnDateTime(upcomingSameBooth.endTime);
        const earliestCheckIn = new Date(
          upcomingSameBooth.startTime.getTime() - this.getCheckInEarlyMinutes() * 60 * 1000,
        );
        const latestCheckIn = new Date(
          upcomingSameBooth.endTime.getTime() + this.getCheckInLateMinutes() * 60 * 1000,
        );

        if (now < earliestCheckIn) {
          throw new ForbiddenException(
            `Chưa đến giờ check-in. Mở check-in từ UTC ${this.formatUtcDateTime(earliestCheckIn)} (VN ${this.formatVnDateTime(earliestCheckIn)}). Lịch của bạn: UTC ${startLabel} - ${endLabel} (VN ${startLabelVn} - ${endLabelVn}). Hiện tại: UTC ${this.formatUtcDateTime(now)} (VN ${this.formatVnDateTime(now)}).`,
          );
        }

        if (now > latestCheckIn) {
          throw new ForbiddenException(
            `Đã quá giờ check-in. Khung check-in kết thúc UTC ${this.formatUtcDateTime(latestCheckIn)} (VN ${this.formatVnDateTime(latestCheckIn)}). Lịch của bạn: UTC ${startLabel} - ${endLabel} (VN ${startLabelVn} - ${endLabelVn}).`,
          );
        }

        throw new ForbiddenException(
          `Không nằm trong khung giờ check-in. Lịch gần nhất của bạn: UTC ${startLabel} - ${endLabel} (VN ${startLabelVn} - ${endLabelVn}). Hiện tại: UTC ${this.formatUtcDateTime(now)} (VN ${this.formatVnDateTime(now)}).`,
        );
      }

      throw new ForbiddenException('Không có booking hợp lệ theo booth và khung giờ để check-in');
    }

    if (booking.status === 'CHECKED_IN') {
      return booking;
    }

    const checkedInBooking = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CHECKED_IN',
        checkedInAt: now,
      },
    });

    this.realtimeService.bookingCheckin({
      bookingId: checkedInBooking.id,
      boothId: checkedInBooking.boothId,
      userId: checkedInBooking.userId,
      status: 'CHECKED_IN',
      type: checkedInBooking.type,
      startTime: checkedInBooking.startTime.toISOString(),
      endTime: checkedInBooking.endTime.toISOString(),
      checkedInAt: checkedInBooking.checkedInAt?.toISOString(),
      emittedAt: new Date().toISOString(),
    });

    this.realtimeService.notify({
      userId: checkedInBooking.userId,
      boothId: checkedInBooking.boothId,
      message: 'Check-in thành công. Phiên sử dụng booth đã bắt đầu.',
      level: 'success',
      emittedAt: new Date().toISOString(),
    });

    return checkedInBooking;
  }

  /**
   * Require an active checked-in booking to start practice/exam.
   */
  async requireActiveCheckedInBooking(userId: string, type: BookingType) {
    await this.autoCheckOutExpiredBookings();

    const now = this.getNowInVietnamConvention();
    const booking = await this.prisma.booking.findFirst({
      where: {
        userId,
        type,
        status: 'CHECKED_IN',
        startTime: { lte: now },
        endTime: { gte: now },
      },
      orderBy: { startTime: 'asc' },
    });

    if (!booking) {
      const activeOtherType = await this.prisma.booking.findFirst({
        where: {
          userId,
          status: 'CHECKED_IN',
          checkedOutAt: null,
          type: { not: type },
          endTime: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
        },
        orderBy: { checkedInAt: 'desc' },
      });

      if (activeOtherType) {
        const currentTypeLabel = activeOtherType.type === 'PRACTICE' ? 'luyện tập' : 'thi';
        const targetTypeLabel = type === 'PRACTICE' ? 'luyện tập' : 'thi';
        throw new ForbiddenException(
          `Bạn đã check-in ca ${currentTypeLabel}. Vui lòng vào đúng module ${currentTypeLabel}, hoặc check-in lại lịch ${targetTypeLabel}.`,
        );
      }

      // Fallback: in case of mixed timezone conventions in legacy data,
      // still allow a checked-in session if it has not been checked out and its endTime is near/future.
      const checkedInFallback = await this.prisma.booking.findFirst({
        where: {
          userId,
          type,
          status: 'CHECKED_IN',
          checkedOutAt: null,
          endTime: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000) },
        },
        orderBy: { checkedInAt: 'desc' },
      });

      if (checkedInFallback) {
        return checkedInFallback;
      }

      throw new ForbiddenException(
        type === 'EXAM'
          ? 'Bạn cần check-in booth đúng lịch trước khi bắt đầu thi'
          : 'Bạn cần check-in booth đúng lịch trước khi bắt đầu luyện tập',
      );
    }

    return booking;
  }

  /**
   * Auto complete bookings that were checked-in but already passed end time.
   */
  async autoCheckOutExpiredBookings() {
    const now = this.getNowInVietnamConvention();
    const expiredBookings = await this.prisma.booking.findMany({
      where: {
        status: 'CHECKED_IN',
        endTime: { lt: now },
      },
      select: {
        id: true,
        boothId: true,
        userId: true,
        type: true,
        startTime: true,
        endTime: true,
      },
    });

    if (expiredBookings.length === 0) {
      return 0;
    }

    const result = await this.prisma.booking.updateMany({
      where: {
        id: { in: expiredBookings.map((booking) => booking.id) },
      },
      data: {
        status: 'COMPLETED',
        checkedOutAt: now,
      },
    });

    for (const booking of expiredBookings) {
      this.realtimeService.bookingCheckout({
        bookingId: booking.id,
        boothId: booking.boothId,
        userId: booking.userId,
        status: 'COMPLETED',
        type: booking.type,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        checkedOutAt: now.toISOString(),
        emittedAt: new Date().toISOString(),
      });
    }

    return result.count;
  }

  /**
   * Mark expired confirmed bookings as NO_SHOW and apply penalty points.
   */
  async autoMarkNoShowAndApplyPenalty() {
    const now = this.getNowInVietnamConvention();

    const noShowCandidates = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        endTime: { lt: now },
      },
      select: {
        id: true,
        userId: true,
        type: true,
        startTime: true,
        endTime: true,
      },
    });

    if (noShowCandidates.length === 0) {
      return { markedCount: 0, penalizedCount: 0 };
    }

    await this.prisma.booking.updateMany({
      where: { id: { in: noShowCandidates.map((booking) => booking.id) } },
      data: { status: 'NO_SHOW' },
    });

    let penalizedCount = 0;
    for (const booking of noShowCandidates) {
      const existingPenalty = await this.prisma.pointTransaction.findFirst({
        where: {
          userId: booking.userId,
          type: 'NO_SHOW_PENALTY',
          bookingId: booking.id,
        },
        select: { id: true },
      });

      if (existingPenalty) {
        continue;
      }

      await this.pointsService.addTransaction(
        booking.userId,
        'NO_SHOW_PENALTY',
        -8,
        `Vắng mặt ca ${booking.type}: ${this.formatUtcDateTime(booking.startTime)} - ${this.formatUtcDateTime(booking.endTime)}`,
        { bookingId: booking.id },
      );
      penalizedCount++;
    }

    return { markedCount: noShowCandidates.length, penalizedCount };
  }
}
