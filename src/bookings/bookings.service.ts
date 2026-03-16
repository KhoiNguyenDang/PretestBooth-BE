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

@Injectable()
export class BookingsService {
  private static readonly AUTO_CHECKIN_EARLY_MINUTES = 15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly boothsService: BoothsService,
  ) {}

  private isWithinAutoCheckInWindow(startTime: Date, endTime: Date, now: Date) {
    const earliestCheckIn = new Date(
      startTime.getTime() - BookingsService.AUTO_CHECKIN_EARLY_MINUTES * 60 * 1000,
    );

    return now >= earliestCheckIn && now <= endTime;
  }

  /**
   * Create a booking with full business rule validation:
   * - Must book at least 7 days in advance
   * - Time slot must be within 7:00 - 17:00
   * - PRACTICE: 30-60 min, EXAM: 30-75 min
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
    const now = new Date();

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

    // Rule 3: Duration constraints
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMin = durationMs / (1000 * 60);

    if (durationMin < 30) {
      throw new BadRequestException('Thời gian sử dụng booth tối thiểu 30 phút');
    }

    if (dto.type === 'PRACTICE' && durationMin > 60) {
      throw new BadRequestException('Thời gian luyện tập tối đa 60 phút');
    }

    if (dto.type === 'EXAM' && durationMin > 75) {
      throw new BadRequestException('Thời gian kiểm tra tối đa 75 phút');
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

  /**
   * Check-in to a booth
   */
  async checkIn(bookingId: string, userRole: string) {
    if (!['ADMIN', 'LECTURER'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể check-in');
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException('Booking chưa được xác nhận hoặc đã check-in');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN', checkedInAt: new Date() },
    });
  }

  /**
   * Check-out from a booth
   */
  async checkOut(bookingId: string, userRole: string) {
    if (!['ADMIN', 'LECTURER'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể check-out');
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (booking.status !== 'CHECKED_IN') {
      throw new BadRequestException('Booking chưa check-in');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED', checkedOutAt: new Date() },
    });
  }

  /**
   * Student auto check-in for their own booking in valid time window.
   */
  async autoCheckIn(bookingId: string, userId: string, userRole: string) {
    if (userRole !== 'STUDENT') {
      throw new ForbiddenException('Chỉ sinh viên mới có thể tự check-in');
    }

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking không tồn tại');

    if (booking.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền check-in booking này');
    }

    if (booking.status === 'CHECKED_IN') {
      return booking;
    }

    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException('Chỉ có thể tự check-in booking ở trạng thái CONFIRMED');
    }

    const now = new Date();
    if (!this.isWithinAutoCheckInWindow(booking.startTime, booking.endTime, now)) {
      const earliestCheckIn = new Date(
        booking.startTime.getTime() - BookingsService.AUTO_CHECKIN_EARLY_MINUTES * 60 * 1000,
      );

      if (now < earliestCheckIn) {
        throw new BadRequestException('Bạn chỉ có thể check-in trước tối đa 15 phút so với giờ bắt đầu');
      }

      throw new BadRequestException('Đã quá khung giờ check-in của booking này');
    }

    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'CHECKED_IN', checkedInAt: now },
    });
  }

  /**
   * Require an active checked-in booking to start practice/exam.
   */
  async requireActiveCheckedInBooking(userId: string, type: BookingType) {
    await this.autoCheckOutExpiredBookings();

    const now = new Date();
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
    const now = new Date();
    const result = await this.prisma.booking.updateMany({
      where: {
        status: 'CHECKED_IN',
        endTime: { lt: now },
      },
      data: {
        status: 'COMPLETED',
        checkedOutAt: now,
      },
    });

    return result.count;
  }
}
