import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BoothsService } from '../booths/booths.service';
import type {
  CreateBookingDto,
  ForceCheckoutDto,
  MonitoringNotifyDto,
  QueryActiveMonitoringDto,
  QueryBookingDto,
} from './dto/booking.dto';
import type { Prisma, BookingStatus, BookingType } from '@prisma/client';
import { RealtimeService } from '../realtime/realtime.service';
import { PointsService } from '../points/points.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { BoothPoliciesService } from '../booth-policies/booth-policies.service';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly boothsService: BoothsService,
    private readonly realtimeService: RealtimeService,
    private readonly pointsService: PointsService,
    private readonly authorizationService: AuthorizationService,
    private readonly boothPoliciesService: BoothPoliciesService,
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

  private getCheckInEarlyMinutes() {
    return Number(process.env.CHECKIN_EARLY_MINUTES || 15);
  }

  private getCheckInLateMinutes() {
    return Number(process.env.CHECKIN_LATE_MINUTES || 0);
  }

  private isWithinAutoCheckInWindow(startTime: Date, endTime: Date, now: Date) {
    const earliestCheckIn = new Date(
      startTime.getTime() - this.getCheckInEarlyMinutes() * 60 * 1000,
    );
    const latestCheckIn = new Date(endTime.getTime() + this.getCheckInLateMinutes() * 60 * 1000);

    return now >= earliestCheckIn && now <= latestCheckIn;
  }

  // Use canonical server/database timeline (absolute timestamp).
  private getNowInVietnamConvention() {
    return new Date();
  }

  private normalizeVietnamDayBoundary(input: Date) {
    const date = new Date(input);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private addDaysVietnam(date: Date, days: number) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    result.setUTCHours(0, 0, 0, 0);
    return result;
  }

  private findNextExamBookingForBooth(boothId: string, now: Date) {
    return this.prisma.booking.findFirst({
      where: {
        boothId,
        type: 'EXAM',
        status: { in: ['CONFIRM', 'CHECKED_IN'] },
        endTime: { gte: now },
      },
      orderBy: { startTime: 'asc' },
    });
  }

  private formatUtcDateTime(date: Date) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }

  private formatServerLocalDateTime(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private getVietnamHourMinute(input: Date) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(input);

    const getNumber = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

    return {
      hour: getNumber('hour'),
      minute: getNumber('minute'),
    };
  }

  /**
   * Create a booking with full business rule validation:
   * - Booking date must be within admin-configured min/max days in advance
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

    // Check if account is locked and get auth status
    const [user, auth, kycProfile, embedding] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userAuth.findUnique({ where: { userId } }),
      this.prisma.userKyc.findUnique({ where: { userId } }),
      this.prisma.userFaceEmbedding.findUnique({ where: { userId } }),
    ]);

    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    if (auth?.isLocked) {
      throw new ForbiddenException('Tài khoản đã bị khóa, không thể đặt lịch');
    }

    // Read KYC status and embedding from domain tables
    if (!kycProfile || kycProfile.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException(
        'Bạn cần hoàn tất xác thực khuôn mặt (KYC) trước khi đặt lịch sử dụng booth',
      );
    }

    const hasFaceEmbedding = embedding?.faceEmbedding && Array.isArray(embedding.faceEmbedding) && embedding.faceEmbedding.length > 0;
    if (!hasFaceEmbedding) {
      throw new ForbiddenException(
        'Bạn cần hoàn tất xác thực khuôn mặt (KYC) trước khi đặt lịch sử dụng booth',
      );
    }

    const policy = await this.boothPoliciesService.getConfig();

    const bookingDate = this.normalizeVietnamDayBoundary(new Date(dto.date));
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    const now = this.normalizeVietnamDayBoundary(this.getNowInVietnamConvention());

    if (
      Number.isNaN(bookingDate.getTime()) ||
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime())
    ) {
      throw new BadRequestException('Thời gian booking không hợp lệ');
    }

    // Rule 1: Booking date must be within policy range
    const minBookingDate = this.addDaysVietnam(now, policy.bookingMinDaysInAdvance);
    const maxBookingDate = this.addDaysVietnam(now, policy.bookingMaxDaysInAdvance);

    if (bookingDate < minBookingDate) {
      throw new BadRequestException(
        `Phai dang ky truoc toi thieu ${policy.bookingMinDaysInAdvance} ngay`,
      );
    }

    if (bookingDate > maxBookingDate) {
      throw new BadRequestException(
        `Chi duoc dang ky toi da ${policy.bookingMaxDaysInAdvance} ngay ke tu hom nay`,
      );
    }

    // Rule 2: Time slot must be within 7:00 - 17:00 in Vietnam local time.
    const { hour: startHour } = this.getVietnamHourMinute(startTime);
    const { hour: endHour, minute: endMinute } = this.getVietnamHourMinute(endTime);

    if (startHour < 7 || endHour > 17 || (endHour === 17 && endMinute > 0)) {
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
        status: { in: ['CONFIRM', 'CHECKED_IN'] },
        OR: [{ startTime: { lt: gapCheckEnd }, endTime: { gt: gapCheckStart } }],
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
    const boothStatus = String(booth.status);
    if (boothStatus === 'MAINTENANCE_PENDING') {
      throw new BadRequestException('Booth đang gặp sự cố, vui lòng chọn booth khác');
    }
    if (boothStatus !== 'ACTIVE') {
      throw new BadRequestException('Booth hiện không hoạt động');
    }

    // Check if this specific booth is already booked at this time
    const boothConflict = await this.prisma.booking.findFirst({
      where: {
        boothId: dto.boothId,
        date: bookingDate,
        status: { in: ['CONFIRM', 'CHECKED_IN'] },
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
        status: { in: ['CONFIRM', 'CHECKED_IN'] },
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
        durationMinutes: Math.round(durationMin),
        bufferMinutes: 15, // Fixed 15 min gap between consecutive sessions
        status: 'CONFIRM',
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
    if (date) {
      const dayStart = this.normalizeVietnamDayBoundary(new Date(date));
      const dayEnd = this.addDaysVietnam(dayStart, 1);

      where.AND = [{ startTime: { lt: dayEnd } }, { endTime: { gte: dayStart } }];
    }

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

  async findActiveMonitoringSessions(
    requesterId: string,
    requesterRole: string,
    query: QueryActiveMonitoringDto,
  ) {
    await this.assertMonitoringPermission(
      requesterId,
      requesterRole,
      'xem giám sát phiên thi/booth',
    );
    await this.autoCheckOutExpiredBookings();

    const { page, limit, boothId, activityType, search, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BookingWhereInput = {
      status: 'CHECKED_IN',
      checkedOutAt: null,
      endTime: { gte: this.getNowInVietnamConvention() },
    };

    if (boothId) {
      where.boothId = boothId;
    }

    if (activityType === 'EXAM') {
      where.examSessions = {
        some: { status: 'IN_PROGRESS' },
      };
    } else if (activityType === 'PRACTICE') {
      where.practiceSessions = {
        some: { status: 'IN_PROGRESS' },
      };
    } else if (activityType === 'IDLE') {
      where.examSessions = {
        none: { status: 'IN_PROGRESS' },
      };
      where.practiceSessions = {
        none: { status: 'IN_PROGRESS' },
      };
    }

    if (search) {
      const textFilter = {
        contains: search,
        mode: 'insensitive' as const,
      };

      where.OR = [
        { user: { name: textFilter } },
        { user: { email: textFilter } },
        { user: { studentCode: textFilter } },
        { booth: { name: textFilter } },
        { booth: { code: textFilter } },
      ];
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          endTime: sortOrder,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              studentCode: true,
            },
          },
          booth: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          examSessions: {
            where: {
              status: 'IN_PROGRESS',
            },
            include: {
              exam: {
                select: {
                  id: true,
                  title: true,
                  duration: true,
                },
              },
            },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
          practiceSessions: {
            where: {
              status: 'IN_PROGRESS',
            },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const nowForBooking = this.getNowInVietnamConvention().getTime();
    const now = Date.now();

    const data = bookings.map((booking) => {
      const activeExam = booking.examSessions[0] || null;
      const activePractice = booking.practiceSessions[0] || null;

      const examRemainingSeconds = activeExam
        ? Math.max(0, Math.floor((new Date(activeExam.expiresAt).getTime() - now) / 1000))
        : null;

      const practiceExpiresAt = activePractice
        ? new Date(activePractice.startedAt.getTime() + activePractice.duration * 60 * 1000)
        : null;

      const practiceRemainingSeconds = practiceExpiresAt
        ? Math.max(0, Math.floor((practiceExpiresAt.getTime() - now) / 1000))
        : null;

      const bookingRemainingSeconds = Math.max(
        0,
        Math.floor((new Date(booking.endTime).getTime() - nowForBooking) / 1000),
      );

      const currentActivityType = activeExam ? 'EXAM' : activePractice ? 'PRACTICE' : 'IDLE';
      const currentRemainingSeconds =
        examRemainingSeconds ?? practiceRemainingSeconds ?? bookingRemainingSeconds;

      return {
        bookingId: booking.id,
        boothId: booking.boothId,
        boothName: booking.booth.name,
        boothCode: booking.booth.code,
        userId: booking.userId,
        studentName: booking.user.name,
        studentEmail: booking.user.email,
        studentCode: booking.user.studentCode,
        bookingType: booking.type,
        status: booking.status,
        checkedInAt: booking.checkedInAt,
        bookingStartTime: booking.startTime,
        bookingEndTime: booking.endTime,
        bookingRemainingSeconds,
        currentActivityType,
        currentRemainingSeconds,
        isWarning: currentRemainingSeconds <= 10 * 60,
        activeExam: activeExam
          ? {
              sessionId: activeExam.id,
              examId: activeExam.examId,
              examTitle: activeExam.exam.title,
              startedAt: activeExam.startedAt,
              expiresAt: activeExam.expiresAt,
              duration: activeExam.exam.duration,
              remainingSeconds: examRemainingSeconds,
            }
          : null,
        activePractice: activePractice
          ? {
              sessionId: activePractice.id,
              startedAt: activePractice.startedAt,
              duration: activePractice.duration,
              expiresAt: practiceExpiresAt,
              remainingSeconds: practiceRemainingSeconds,
            }
          : null,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async forceCheckoutByMonitor(
    bookingId: string,
    dto: ForceCheckoutDto,
    requesterId: string,
    requesterRole: string,
  ) {
    await this.assertMonitoringPermission(requesterId, requesterRole, 'buộc checkout phiên booth');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        examSessions: {
          where: { status: 'IN_PROGRESS' },
          select: { id: true },
        },
        practiceSessions: {
          where: { status: 'IN_PROGRESS' },
          select: { id: true },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking không tồn tại');
    }

    if (booking.status !== 'CHECKED_IN') {
      throw new BadRequestException('Booking không ở trạng thái CHECKED_IN');
    }

    const now = this.getNowInVietnamConvention();

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
          checkedOutAt: now,
        },
      });

      await tx.examSession.updateMany({
        where: {
          bookingId,
          status: 'IN_PROGRESS',
        },
        data: {
          status: 'SUBMITTED',
          finishedAt: new Date(),
        },
      });

      await tx.practiceSession.updateMany({
        where: {
          bookingId,
          status: 'IN_PROGRESS',
        },
        data: {
          status: 'ABANDONED',
          finishedAt: new Date(),
        },
      });
    });

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

    for (const examSession of booking.examSessions) {
      this.realtimeService.sessionTerminated({
        sessionType: 'EXAM',
        sessionId: examSession.id,
        userId: booking.userId,
        boothId: booking.boothId,
        status: 'SUBMITTED',
        reason: dto.reason,
        emittedAt: new Date().toISOString(),
      });
    }

    for (const practiceSession of booking.practiceSessions) {
      this.realtimeService.sessionTerminated({
        sessionType: 'PRACTICE',
        sessionId: practiceSession.id,
        userId: booking.userId,
        boothId: booking.boothId,
        status: 'ABANDONED',
        reason: dto.reason,
        emittedAt: new Date().toISOString(),
      });
    }

    this.realtimeService.monitoringUpdated({
      scope: 'BOOKING',
      action: 'FORCE_CHECKOUT',
      bookingId: booking.id,
      boothId: booking.boothId,
      userId: booking.userId,
      emittedAt: new Date().toISOString(),
    });

    this.realtimeService.notify({
      userId: booking.userId,
      boothId: booking.boothId,
      message: `Phiên booth đã bị kết thúc bởi quản trị viên/giảng viên. Lý do: ${dto.reason}`,
      level: 'warning',
      emittedAt: new Date().toISOString(),
    });

    return {
      message: 'Buộc checkout thành công',
      bookingId,
      affectedExamSessions: booking.examSessions.length,
      affectedPracticeSessions: booking.practiceSessions.length,
    };
  }

  async notifyByMonitor(
    bookingId: string,
    dto: MonitoringNotifyDto,
    requesterId: string,
    requesterRole: string,
  ) {
    await this.assertMonitoringPermission(requesterId, requesterRole, 'gửi cảnh báo realtime');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        boothId: true,
        userId: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking không tồn tại');
    }

    const emittedAt = new Date().toISOString();

    this.realtimeService.notify({
      userId: booking.userId,
      boothId: booking.boothId,
      message: dto.message,
      level: dto.level || 'warning',
      emittedAt,
    });

    this.realtimeService.monitoringUpdated({
      scope: 'BOOKING',
      action: 'NOTIFY',
      bookingId: booking.id,
      boothId: booking.boothId,
      userId: booking.userId,
      emittedAt,
    });

    return {
      message: 'Đã gửi cảnh báo realtime',
      bookingId: booking.id,
    };
  }

  /**
   * Get availability for a specific date
   */
  async getAvailability(dateStr: string, userRole?: string) {
    const policy = await this.boothPoliciesService.getConfig();
    const date = this.normalizeVietnamDayBoundary(new Date(dateStr));

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Ngay truy van khong hop le');
    }

    if (userRole === 'STUDENT') {
      const today = this.normalizeVietnamDayBoundary(this.getNowInVietnamConvention());
      const minBookingDate = this.addDaysVietnam(today, policy.bookingMinDaysInAdvance);
      const maxBookingDate = this.addDaysVietnam(today, policy.bookingMaxDaysInAdvance);

      if (date < minBookingDate || date > maxBookingDate) {
        throw new BadRequestException(
          `Ngay dat lich phai trong khoang ${policy.bookingMinDaysInAdvance}-${policy.bookingMaxDaysInAdvance} ngay ke tu hom nay`,
        );
      }
    }

    const normalizedDateStr = date.toISOString().slice(0, 10);
    const dayStart = date;
    const dayEnd = this.addDaysVietnam(date, 1);
    const activeBooths = await this.prisma.booth.findMany({
      where: { status: 'ACTIVE' },
    });

    // Get all bookings for this date. Include COMPLETED so availability shows past
    // bookings (useful for month overview and auditing). We exclude
    // canceled/absent bookings.
    const bookings = await this.prisma.booking.findMany({
      where: {
        startTime: { lt: dayEnd },
        endTime: { gte: dayStart },
        status: { in: ['CONFIRM', 'CHECKED_IN', 'COMPLETED'] },
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
        const isoStringStart = `${normalizedDateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00.000+07:00`;
        const slotStart = new Date(isoStringStart);

        const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

        const booked = bookings.filter((b) => b.startTime < slotEnd && b.endTime > slotStart);

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

    const uniqueBookedBoothIds = new Set(bookings.map((b) => b.boothId));
    const totalSlotsBooked = bookings.reduce((sum, b) => sum + Math.ceil(b.durationMinutes / 30), 0);

    return { 
      date: date.toISOString(), 
      booths: activeBooths, 
      slots,
      dailyStats: {
        bookedBooths: uniqueBookedBoothIds.size,
        bookedSlots: totalSlotsBooked
      }
    };
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

    if (booking.status !== 'CONFIRM') {
      throw new BadRequestException('Không thể hủy booking ở trạng thái này');
    }

    if (userRole === 'STUDENT') {
      const policy = await this.boothPoliciesService.getConfig();
      const cutoffHours = policy.bookingCancellationCutoffHours;
      const now = this.getNowInVietnamConvention();
      const cancellationDeadline = new Date(
        booking.startTime.getTime() - cutoffHours * 60 * 60 * 1000,
      );

      if (now > cancellationDeadline) {
        throw new BadRequestException(
          `Bạn chỉ có thể hủy lịch trước ${cutoffHours} giờ so với thời điểm bắt đầu`,
        );
      }
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCEL' },
    });
  }

  async autoCheckInByBooth(userId: string, boothId: string) {
    const now = this.getNowInVietnamConvention();

    const booking = await this.getPendingCheckInByBooth(userId, boothId);
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

    const booth = await this.prisma.booth.findUnique({
      where: { id: checkedInBooking.boothId },
      select: { status: true },
    });

    if (booth) {
      await this.prisma.boothStatusLog.create({
        data: {
          boothId: checkedInBooking.boothId,
          fromStatus: booth.status,
          toStatus: booth.status,
          note: `Sinh viên auto check-in thành công (booking ${checkedInBooking.id})`,
          changedByUserId: checkedInBooking.userId,
        },
      });
    }

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

  async createWalkInPracticeForBoothLogin(userId: string, boothId: string) {
    const policy = await this.boothPoliciesService.getConfig();
    if (!policy.walkInPracticeEnabled) {
      throw new ForbiddenException('Tinh nang tan dung booth dang duoc tat');
    }

    const booth = await this.prisma.booth.findUnique({
      where: { id: boothId },
      select: { id: true, name: true, code: true, status: true },
    });

    if (!booth) {
      throw new NotFoundException('Booth khong ton tai');
    }

    if (booth.status !== 'ACTIVE') {
      throw new ForbiddenException('Booth hien khong o trang thai hoat dong');
    }

    const now = this.getNowInVietnamConvention();

    const activeCheckedInBooking = await this.prisma.booking.findFirst({
      where: {
        userId,
        status: 'CHECKED_IN',
        checkedOutAt: null,
        endTime: { gte: now },
      },
      orderBy: { checkedInAt: 'desc' },
    });

    if (activeCheckedInBooking && activeCheckedInBooking.boothId !== boothId) {
      throw new ForbiddenException(
        'Ban dang co phien su dung booth khac, khong the tan dung booth nay',
      );
    }

    let nextExamStartTime: string | null = null;
    let warnAt: string | null = null;
    let forceLogoutAt: string | null = null;
    let noShowGraceUntil: string | null = null;

    let nextExamBooking = await this.findNextExamBookingForBooth(boothId, now);

    if (nextExamBooking && nextExamBooking.status === 'CONFIRM') {
      const noShowGraceTime = new Date(
        nextExamBooking.startTime.getTime() + policy.noShowGraceMinutes * 60 * 1000,
      );

      if (now >= noShowGraceTime) {
        await this.markBookingNoShowAndApplyPenalty({
          id: nextExamBooking.id,
          userId: nextExamBooking.userId,
          type: nextExamBooking.type,
          startTime: nextExamBooking.startTime,
          endTime: nextExamBooking.endTime,
        });

        nextExamBooking = await this.findNextExamBookingForBooth(boothId, now);
      }
    }

    let walkInEndTime = new Date(now.getTime() + 120 * 60 * 1000);

    if (nextExamBooking) {
      const examStartTime = nextExamBooking.startTime;
      const warnTime = new Date(
        examStartTime.getTime() - policy.warnBeforeNextExamMinutes * 60 * 1000,
      );
      const forceTime = new Date(
        examStartTime.getTime() - policy.forceLogoutBeforeNextExamMinutes * 60 * 1000,
      );
      const noShowGraceTime = new Date(
        examStartTime.getTime() + policy.noShowGraceMinutes * 60 * 1000,
      );

      if (nextExamBooking.status === 'CHECKED_IN') {
        throw new ForbiddenException('Booth dang duoc su dung cho ca thi khac');
      }

      const inProtectedWindow = now >= forceTime && now <= noShowGraceTime;
      if (inProtectedWindow) {
        throw new ForbiddenException(
          'Booth dang duoc giu cho ca EXAM sap toi. Vui long doi den khi ket thuc thoi gian no-show grace.',
        );
      }

      if (now < forceTime) {
        walkInEndTime = forceTime;
        nextExamStartTime = examStartTime.toISOString();
        warnAt = warnTime.toISOString();
        forceLogoutAt = forceTime.toISOString();
        noShowGraceUntil = noShowGraceTime.toISOString();
      }
    }

    if (walkInEndTime <= now) {
      throw new ForbiddenException('Khong con khoang thoi gian hop le de tan dung booth');
    }

    if (activeCheckedInBooking) {
      return {
        accessMode: 'WALK_IN' as const,
        booking: activeCheckedInBooking,
        policy,
        protection: {
          nextExamStartTime,
          warnAt,
          forceLogoutAt,
          noShowGraceUntil,
        },
      };
    }

    const bookingDate = this.normalizeVietnamDayBoundary(now);
    const durationMinutes = Math.max(
      5,
      Math.round((walkInEndTime.getTime() - now.getTime()) / (60 * 1000)),
    );

    const walkInBooking = await this.prisma.booking.create({
      data: {
        userId,
        boothId,
        type: 'PRACTICE',
        date: bookingDate,
        startTime: now,
        endTime: walkInEndTime,
        durationMinutes,
        bufferMinutes: 0,
        status: 'CHECKED_IN',
        checkedInAt: now,
        checkinStatus: 'PASSED',
        checkinVerifiedAt: now,
      },
    });

    const emittedAt = new Date().toISOString();
    this.realtimeService.bookingCheckin({
      bookingId: walkInBooking.id,
      boothId: walkInBooking.boothId,
      userId: walkInBooking.userId,
      status: 'CHECKED_IN',
      type: walkInBooking.type,
      startTime: walkInBooking.startTime.toISOString(),
      endTime: walkInBooking.endTime.toISOString(),
      checkedInAt: walkInBooking.checkedInAt?.toISOString(),
      emittedAt,
    });

    this.realtimeService.monitoringUpdated({
      scope: 'BOOKING',
      action: 'CHECKIN',
      bookingId: walkInBooking.id,
      boothId: walkInBooking.boothId,
      userId: walkInBooking.userId,
      sessionType: 'PRACTICE',
      emittedAt,
    });

    return {
      accessMode: 'WALK_IN' as const,
      booking: walkInBooking,
      policy,
      protection: {
        nextExamStartTime,
        warnAt,
        forceLogoutAt,
        noShowGraceUntil,
      },
    };
  }

  async getPendingCheckInByBooth(userId: string, boothId: string) {
    const now = this.getNowInVietnamConvention();
    const earlyMs = this.getCheckInEarlyMinutes() * 60 * 1000;
    const lateMs = this.getCheckInLateMinutes() * 60 * 1000;

    const candidates = await this.prisma.booking.findMany({
      where: {
        userId,
        boothId,
        type: { in: ['EXAM', 'PRACTICE'] },
        status: { in: ['CONFIRM', 'CHECKED_IN'] },
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
          status: { in: ['CONFIRM', 'CHECKED_IN'] },
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
          status: 'CONFIRM',
          startTime: { gte: new Date(now.getTime() - earlyMs) },
          endTime: { gte: now },
        },
        orderBy: { startTime: 'asc' },
      });

      if (upcomingSameBooth) {
        const startLabel = this.formatServerLocalDateTime(upcomingSameBooth.startTime);
        const endLabel = this.formatServerLocalDateTime(upcomingSameBooth.endTime);
        const earliestCheckIn = new Date(
          upcomingSameBooth.startTime.getTime() - this.getCheckInEarlyMinutes() * 60 * 1000,
        );
        const latestCheckIn = new Date(
          upcomingSameBooth.endTime.getTime() + this.getCheckInLateMinutes() * 60 * 1000,
        );

        if (now < earliestCheckIn) {
          throw new ForbiddenException(
            `Chưa đến giờ check-in. Mở check-in từ ${this.formatServerLocalDateTime(earliestCheckIn)}. Lịch của bạn: ${startLabel} - ${endLabel}. Hiện tại: ${this.formatServerLocalDateTime(now)}.`,
          );
        }

        if (now > latestCheckIn) {
          throw new ForbiddenException(
            `Đã quá giờ check-in. Khung check-in kết thúc ${this.formatServerLocalDateTime(latestCheckIn)}. Lịch của bạn: ${startLabel} - ${endLabel}.`,
          );
        }

        throw new ForbiddenException(
          `Không nằm trong khung giờ check-in. Lịch gần nhất của bạn: ${startLabel} - ${endLabel}. Hiện tại: ${this.formatServerLocalDateTime(now)}.`,
        );
      }

      throw new ForbiddenException('Không có booking hợp lệ theo booth và khung giờ để check-in');
    }

    return booking;
  }

  /**
   * Find an active checked-in booking if available (non-throwing).
   * Used by online-capable practice flows to optionally keep booth linkage.
   */
  async findActiveCheckedInBooking(userId: string, type: BookingType) {
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

    if (booking) {
      return booking;
    }

    return null;
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
          startTime: { lte: now },
          endTime: { gte: now },
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
   * Mark expired confirmed bookings as ABSENT and apply penalty points.
   */
  private async markBookingNoShowAndApplyPenalty(booking: {
    id: string;
    userId: string;
    type: BookingType;
    startTime: Date;
    endTime: Date;
  }) {
    const updateResult = await this.prisma.booking.updateMany({
      where: {
        id: booking.id,
        status: 'CONFIRM',
      },
      data: { status: 'ABSENT' },
    });

    if (updateResult.count === 0) {
      return { marked: false, penalized: false };
    }

    const existingPenalty = await this.prisma.pointTransaction.findFirst({
      where: {
        userId: booking.userId,
        type: 'NO_SHOW_PENALTY',
        bookingId: booking.id,
      },
      select: { id: true },
    });

    if (existingPenalty) {
      return { marked: true, penalized: false };
    }

    await this.pointsService.addTransaction(
      booking.userId,
      'NO_SHOW_PENALTY',
      -8,
      `Vắng mặt ca ${booking.type}: ${this.formatUtcDateTime(booking.startTime)} - ${this.formatUtcDateTime(booking.endTime)}`,
      { bookingId: booking.id },
    );

    return { marked: true, penalized: true };
  }

  async autoMarkNoShowAndApplyPenalty() {
    const now = this.getNowInVietnamConvention();
    const policy = await this.boothPoliciesService.getConfig();
    const examNoShowGraceCutoff = new Date(now.getTime() - policy.noShowGraceMinutes * 60 * 1000);

    const noShowCandidates = await this.prisma.booking.findMany({
      where: {
        status: 'CONFIRM',
        OR: [
          { endTime: { lt: now } },
          {
            type: 'EXAM',
            startTime: { lte: examNoShowGraceCutoff },
          },
        ],
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

    let markedCount = 0;
    let penalizedCount = 0;

    for (const booking of noShowCandidates) {
      const result = await this.markBookingNoShowAndApplyPenalty({
        id: booking.id,
        userId: booking.userId,
        type: booking.type,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });

      if (result.marked) {
        markedCount++;
      }

      if (result.penalized) {
        penalizedCount++;
      }
    }

    return { markedCount, penalizedCount };
  }
}
