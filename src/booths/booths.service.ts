import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateBoothDto,
  UpdateBoothDto,
  QueryBoothDto,
  TransferBoothBookingsDto,
} from './dto/booth.dto';
import type { BookingStatus, BoothStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { RealtimeService } from '../realtime/realtime.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { MailService } from '../mail/mail.service';

interface BoothSessionBindingContext {
  boothClientId: string;
  userAgent?: string | null;
}

interface TransferCandidateStudent {
  id: string;
  email: string;
  name: string | null;
  studentCode: string | null;
}

@Injectable()
export class BoothsService {
  private static readonly VIETNAM_TZ = 'Asia/Ho_Chi_Minh';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly realtimeService: RealtimeService,
    private readonly authorizationService: AuthorizationService,
    private readonly mailService: MailService,
  ) {}

  private async assertBoothManagementPermission(
    userId: string,
    userRole: string,
    actionLabel: string,
  ) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (userRole !== 'LECTURER') {
      throw new ForbiddenException(`Chỉ giảng viên và quản trị viên mới có thể ${actionLabel}`);
    }

    await this.authorizationService.assertPermission(
      userId,
      userRole,
      'MANAGE_BOOTHS',
      'Giảng viên chưa được cấp quyền quản lý booth',
    );
  }

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

  private getOtpTtlMinutes() {
    return Number(process.env.BOOTH_OTP_TTL_MINUTES || 10);
  }

  private getOtpMaxAttempts() {
    return Number(process.env.BOOTH_OTP_MAX_ATTEMPTS || 5);
  }

  private getBoothSessionSecret() {
    return (
      process.env.BOOTH_SESSION_SECRET || process.env.JWT_ACCESS_SECRET || 'booth-session-secret'
    );
  }

  private normalizeBoothCode(code: string) {
    return code.trim().toUpperCase();
  }

  private normalizeBoothClientId(boothClientId: string) {
    return boothClientId.trim();
  }

  private createBoothSessionBindingHash(boothClientId: string, userAgent?: string | null) {
    const normalizedClientId = this.normalizeBoothClientId(boothClientId);
    const normalizedUserAgent = (userAgent || '').trim().toLowerCase();

    return crypto
      .createHash('sha256')
      .update(`${normalizedClientId}|${normalizedUserAgent}`)
      .digest('hex');
  }

  private generateNumericOtp(length = 6) {
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes)
      .map((b) => (b % 10).toString())
      .join('')
      .slice(0, length);
  }

  private formatVnDateTime(date: Date) {
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: BoothsService.VIETNAM_TZ,
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

  private buildStudentLabel(student: TransferCandidateStudent) {
    return student.name?.trim() || student.studentCode || student.email;
  }

  private formatTransferWindow(startTime: Date, endTime: Date) {
    return `${this.formatVnDateTime(startTime)} - ${this.formatVnDateTime(endTime)}`;
  }

  private async notifyTransferConflictsByEmail(params: {
    sourceBoothName: string;
    sourceBoothCode?: string | null;
    targetBoothName: string;
    targetBoothCode?: string | null;
    reason: string;
    conflicts: Array<{
      student: TransferCandidateStudent;
      bookingId: string;
      startTime: Date;
      endTime: Date;
      reason: string;
    }>;
  }) {
    if (params.conflicts.length === 0) {
      return;
    }

    const mailJobs = params.conflicts.map((item) =>
      this.mailService.sendBoothTransferConflictEmail({
        email: item.student.email,
        studentName: item.student.name,
        studentCode: item.student.studentCode,
        sourceBoothName: params.sourceBoothName,
        sourceBoothCode: params.sourceBoothCode,
        targetBoothName: params.targetBoothName,
        targetBoothCode: params.targetBoothCode,
        reason: params.reason,
        bookingWindow: this.formatTransferWindow(item.startTime, item.endTime),
        conflictReason: item.reason,
      }),
    );

    await Promise.allSettled(mailJobs);
  }

  private mapBoothForResponse(booth: any) {
    const { sessionTokenHash, ...rest } = booth;
    return {
      ...rest,
      isSessionActive:
        ['ACTIVE', 'MAINTENANCE_PENDING'].includes(rest.status) && Boolean(sessionTokenHash),
    };
  }

  private async appendBoothActivityLog(
    boothId: string,
    status: BoothStatus,
    note: string,
    changedByUserId: string | null = null,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    await db.boothStatusLog.create({
      data: {
        boothId,
        fromStatus: status,
        toStatus: status,
        note,
        changedByUserId,
      },
    });
  }

  async create(dto: CreateBoothDto, userRole: string, userId: string) {
    await this.assertBoothManagementPermission(userId, userRole, 'tạo booth');

    const exists = await this.prisma.booth.findUnique({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Booth "${dto.name}" đã tồn tại`);
    }

    const normalizedCode = dto.code ? this.normalizeBoothCode(dto.code) : null;
    if (normalizedCode) {
      const codeExists = await this.prisma.booth.findUnique({ where: { code: normalizedCode } });
      if (codeExists) {
        throw new ConflictException(`Mã booth "${normalizedCode}" đã tồn tại`);
      }
    }

    const created = await this.prisma.booth.create({
      data: {
        name: dto.name,
        code: normalizedCode,
        description: dto.description || null,
        location: dto.location || null,
      },
    });

    return this.mapBoothForResponse(created);
  }

  async findAll(query: QueryBoothDto) {
    const where: Prisma.BoothWhereInput = {};
    if (query.status) {
      where.status = query.status as BoothStatus;
    }

    const booths = await this.prisma.booth.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { bookings: true } },
      },
    });

    return booths.map((booth) => this.mapBoothForResponse(booth));
  }

  async findOne(id: string) {
    const booth = await this.prisma.booth.findUnique({
      where: { id },
      include: {
        _count: { select: { bookings: true } },
        statusLogs: {
          orderBy: { changedAt: 'desc' },
          take: 20,
          include: {
            changedByUser: { select: { id: true, email: true, name: true } },
          },
        },
      },
    });

    if (!booth) throw new NotFoundException('Booth không tồn tại');
    return this.mapBoothForResponse(booth);
  }

  async update(id: string, dto: UpdateBoothDto, userRole: string, userId: string) {
    await this.assertBoothManagementPermission(userId, userRole, 'cập nhật booth');

    const booth = await this.prisma.booth.findUnique({ where: { id } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');

    if (dto.name && dto.name !== booth.name) {
      const nameExists = await this.prisma.booth.findUnique({ where: { name: dto.name } });
      if (nameExists) throw new ConflictException(`Tên booth "${dto.name}" đã tồn tại`);
    }

    const normalizedCode =
      dto.code === null ? null : dto.code ? this.normalizeBoothCode(dto.code) : undefined;
    if (normalizedCode && normalizedCode !== booth.code) {
      const codeExists = await this.prisma.booth.findUnique({ where: { code: normalizedCode } });
      if (codeExists) throw new ConflictException(`Mã booth "${normalizedCode}" đã tồn tại`);
    }

    const isStatusChanged = dto.status && dto.status !== booth.status;

    const shouldInvalidateSession =
      isStatusChanged && dto.status !== 'ACTIVE' && dto.status !== 'MAINTENANCE_PENDING';

    const txResult = await this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.BoothUpdateInput = {
        ...(dto.name && { name: dto.name }),
        ...(normalizedCode !== undefined && { code: normalizedCode }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.status && { status: dto.status as BoothStatus }),
      };

      if (shouldInvalidateSession) {
        updateData.sessionTokenHash = null;
        updateData.sessionActivatedAt = null;
      }

      const updated = await tx.booth.update({
        where: { id },
        data: updateData,
      });

      let statusLog: {
        changedAt: Date;
      } | null = null;

      if (isStatusChanged) {
        statusLog = await tx.boothStatusLog.create({
          data: {
            boothId: booth.id,
            fromStatus: booth.status,
            toStatus: dto.status as BoothStatus,
            note: dto.statusNote || '',
            changedByUserId: userId,
          },
          select: {
            changedAt: true,
          },
        });
      }

      return { updated, statusLog };
    });

    if (isStatusChanged && txResult.statusLog) {
      this.realtimeService.boothStatusUpdated({
        boothId: txResult.updated.id,
        status: txResult.updated.status,
        previousStatus: booth.status,
        note: dto.statusNote || '',
        changedByUserId: userId,
        changedAt: txResult.statusLog.changedAt.toISOString(),
      });
    }

    return this.mapBoothForResponse(txResult.updated);
  }

  async getStatusLogs(boothId: string) {
    const booth = await this.prisma.booth.findUnique({ where: { id: boothId } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');

    return this.prisma.boothStatusLog.findMany({
      where: { boothId },
      orderBy: { changedAt: 'desc' },
      include: {
        changedByUser: { select: { id: true, email: true, name: true } },
      },
    });
  }

  async remove(id: string, userRole: string, userId: string) {
    await this.assertBoothManagementPermission(userId, userRole, 'xóa booth');

    const booth = await this.prisma.booth.findUnique({ where: { id } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');

    await this.prisma.booth.delete({ where: { id } });
    return { message: 'Xóa booth thành công' };
  }

  async transferBookingsFromIncidentBooth(
    sourceBoothId: string,
    dto: TransferBoothBookingsDto,
    userRole: string,
    userId: string,
  ) {
    await this.assertBoothManagementPermission(userId, userRole, 'chuyển danh sách booth bị sự cố');

    if (sourceBoothId === dto.targetBoothId) {
      throw new BadRequestException('Booth nguồn và booth đích không được trùng nhau');
    }

    const selectedBookingIds = dto.bookingIds ? Array.from(new Set(dto.bookingIds)) : null;
    const candidateStatuses: BookingStatus[] = dto.includeCheckedIn
      ? ['CONFIRM', 'CHECKED_IN']
      : ['CONFIRM'];

    const now = new Date();
    const transferResult = await this.prisma.$transaction(async (tx) => {
      const sourceBooth = await tx.booth.findUnique({ where: { id: sourceBoothId } });
      if (!sourceBooth) {
        throw new NotFoundException('Booth nguồn không tồn tại');
      }

      const targetBooth = await tx.booth.findUnique({ where: { id: dto.targetBoothId } });
      if (!targetBooth) {
        throw new NotFoundException('Booth đích không tồn tại');
      }

      if (targetBooth.status !== 'ACTIVE') {
        throw new BadRequestException('Booth đích phải ở trạng thái ACTIVE');
      }

      const candidates = await tx.booking.findMany({
        where: {
          boothId: sourceBoothId,
          status: { in: candidateStatuses },
          endTime: { gte: now },
          ...(selectedBookingIds ? { id: { in: selectedBookingIds } } : {}),
        },
        orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          userId: true,
          status: true,
          startTime: true,
          endTime: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          student: { select: { studentCode: true, className: true } },
        },
      });

      const transferred: Array<{
        bookingId: string;
        userId: string;
        status: string;
        studentName: string;
        studentEmail: string;
        startTime: Date;
        endTime: Date;
      }> = [];
      const skipped: Array<{
        bookingId: string;
        reason: string;
        wasCancelled: boolean;
        userId: string;
        studentName: string;
        studentEmail: string;
        startTime: Date;
        endTime: Date;
      }> = [];

      for (const candidate of candidates) {
        const studentName = this.buildStudentLabel({
          id: candidate.user.id,
          email: candidate.user.email,
          name: candidate.user.name,
          studentCode: candidate.student?.studentCode ?? null,
        });
        const conflict = await tx.booking.findFirst({
          where: {
            boothId: targetBooth.id,
            status: { in: ['CONFIRM', 'CHECKED_IN'] },
            startTime: { lt: candidate.endTime },
            endTime: { gt: candidate.startTime },
          },
          select: { id: true },
        });

        if (conflict) {
          if (!dto.dryRun) {
            const cancelled = await tx.booking.updateMany({
              where: {
                id: candidate.id,
                boothId: sourceBooth.id,
                status: { in: ['CONFIRM', 'CHECKED_IN'] },
                endTime: { gte: now },
              },
              data: {
                status: 'CANCEL',
              },
            });

            if (cancelled.count > 0) {
              skipped.push({
                bookingId: candidate.id,
                reason:
                  'Booth đích đã có lịch trùng khung giờ. Booking đã được chuyển trạng thái CANCEL',
                wasCancelled: true,
                userId: candidate.userId,
                studentName,
                studentEmail: candidate.user.email,
                startTime: candidate.startTime,
                endTime: candidate.endTime,
              });
              continue;
            }
          }

          skipped.push({
            bookingId: candidate.id,
            reason: 'Booth đích đã có lịch trùng khung giờ',
            wasCancelled: false,
            userId: candidate.userId,
            studentName,
            studentEmail: candidate.user.email,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
          });
          continue;
        }

        if (dto.dryRun) {
          transferred.push({
            bookingId: candidate.id,
            userId: candidate.userId,
            status: candidate.status,
            studentName,
            studentEmail: candidate.user.email,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
          });
          continue;
        }

        const updated = await tx.booking.updateMany({
          where: {
            id: candidate.id,
            boothId: sourceBooth.id,
            status: { in: ['CONFIRM', 'CHECKED_IN'] },
            endTime: { gte: now },
          },
          data: {
            boothId: targetBooth.id,
          },
        });

        if (updated.count === 0) {
          skipped.push({
            bookingId: candidate.id,
            reason: 'Booking đã thay đổi trạng thái hoặc booth trong lúc xử lý',
            wasCancelled: false,
            userId: candidate.userId,
            studentName,
            studentEmail: candidate.user.email,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
          });
          continue;
        }

        transferred.push({
          bookingId: candidate.id,
          userId: candidate.userId,
          status: candidate.status,
          studentName,
          studentEmail: candidate.user.email,
          startTime: candidate.startTime,
          endTime: candidate.endTime,
        });
      }

      if (dto.dryRun) {
        return {
          dryRun: true,
          sourceBooth,
          targetBooth,
          updatedSourceBooth: null,
          sourceStatusAfterTransfer: null,
          transferred,
          skipped,
          totalCandidates: candidates.length,
        };
      }

      const remainingBookingsOnSource = await tx.booking.count({
        where: {
          boothId: sourceBooth.id,
          status: { in: ['CONFIRM', 'CHECKED_IN'] },
          endTime: { gte: now },
        },
      });

      const sourceStatusAfterTransfer: BoothStatus =
        remainingBookingsOnSource > 0 ? 'MAINTENANCE_PENDING' : 'MAINTENANCE';

      const updatedSourceBooth = await tx.booth.update({
        where: { id: sourceBooth.id },
        data: {
          status: sourceStatusAfterTransfer,
          ...(sourceStatusAfterTransfer === 'MAINTENANCE'
            ? {
                sessionTokenHash: null,
                sessionActivatedAt: null,
              }
            : {}),
        },
      });

      const note = [
        `Chuyển booking do booth sự cố sang ${targetBooth.name}${targetBooth.code ? ` (${targetBooth.code})` : ''}.`,
        `Lý do: ${dto.reason}.`,
        selectedBookingIds
          ? `Chế độ thủ công: ${selectedBookingIds.length} booking được chọn.`
          : 'Chế độ tự động: xử lý toàn bộ booking đủ điều kiện.',
        dto.includeCheckedIn ? 'Bao gồm booking CHECKED_IN.' : 'Không bao gồm booking CHECKED_IN.',
        `Ứng viên: ${candidates.length}, chuyển thành công: ${transferred.length}, bỏ qua: ${skipped.length}.`,
      ].join(' ');

      await tx.boothStatusLog.create({
        data: {
          boothId: sourceBooth.id,
          fromStatus: sourceBooth.status,
          toStatus: sourceStatusAfterTransfer,
          note,
          changedByUserId: userId,
        },
      });

      return {
        dryRun: false,
        sourceBooth,
        targetBooth,
        updatedSourceBooth,
        sourceStatusAfterTransfer,
        transferred,
        skipped,
        totalCandidates: candidates.length,
      };
    });

    if (transferResult.dryRun) {
      return {
        sourceBoothId: transferResult.sourceBooth.id,
        targetBoothId: transferResult.targetBooth.id,
        dryRun: true,
        totalCandidates: transferResult.totalCandidates,
        transferableCount: transferResult.transferred.length,
        conflictCount: transferResult.skipped.length,
        transferableBookings: transferResult.transferred.map((item) => ({
          bookingId: item.bookingId,
          studentName: item.studentName,
          studentEmail: item.studentEmail,
          status: item.status,
          startTime: item.startTime,
          endTime: item.endTime,
        })),
        transferableBookingIds: transferResult.transferred.map((item) => item.bookingId),
        conflicts: transferResult.skipped.map((item) => ({
          bookingId: item.bookingId,
          userId: item.userId,
          studentName: item.studentName,
          studentEmail: item.studentEmail,
          startTime: item.startTime,
          endTime: item.endTime,
          wasCancelled: item.wasCancelled,
          reason: item.reason,
        })),
        includeCheckedIn: dto.includeCheckedIn,
      };
    }

    const cancelledConflicts = transferResult.skipped.filter((item) => item.wasCancelled);
    await this.notifyTransferConflictsByEmail({
      sourceBoothName: transferResult.sourceBooth.name,
      sourceBoothCode: transferResult.sourceBooth.code,
      targetBoothName: transferResult.targetBooth.name,
      targetBoothCode: transferResult.targetBooth.code,
      reason: dto.reason,
      conflicts: cancelledConflicts.map((item) => ({
        student: {
          id: item.userId,
          email: item.studentEmail,
          name: item.studentName,
          studentCode: null,
        },
        bookingId: item.bookingId,
        startTime: item.startTime,
        endTime: item.endTime,
        reason: item.reason,
      })),
    });

    if (!transferResult.updatedSourceBooth) {
      throw new BadRequestException(
        'Không thể cập nhật trạng thái booth nguồn sau khi chuyển lịch',
      );
    }

    const emittedAt = new Date().toISOString();
    this.realtimeService.boothStatusUpdated({
      boothId: transferResult.updatedSourceBooth.id,
      status: transferResult.updatedSourceBooth.status,
      previousStatus: transferResult.sourceBooth.status,
      note: `Booth chuyển lịch sự cố sang ${transferResult.targetBooth.name}. Lý do: ${dto.reason}`,
      changedByUserId: userId,
      changedAt: emittedAt,
    });

    for (const transferred of transferResult.transferred) {
      this.realtimeService.monitoringUpdated({
        scope: 'BOOKING',
        action: 'TRANSFER_BOOKING',
        bookingId: transferred.bookingId,
        boothId: transferResult.targetBooth.id,
        userId: transferred.userId,
        emittedAt,
      });

      this.realtimeService.notify({
        userId: transferred.userId,
        boothId: transferResult.targetBooth.id,
        message: `Lịch booth của bạn đã được chuyển sang ${transferResult.targetBooth.name}${transferResult.targetBooth.code ? ` (${transferResult.targetBooth.code})` : ''} do sự cố booth. Lý do: ${dto.reason}`,
        level: 'warning',
        emittedAt,
      });
    }

    return {
      sourceBoothId: transferResult.sourceBooth.id,
      targetBoothId: transferResult.targetBooth.id,
      dryRun: false,
      cancelledDueToConflicts: false,
      message:
        cancelledConflicts.length > 0
          ? `Đã chuyển ${transferResult.transferred.length} booking. Có ${cancelledConflicts.length} booking trùng lịch đã được cập nhật sang CANCEL.`
          : undefined,
      totalCandidates: transferResult.totalCandidates,
      transferredCount: transferResult.transferred.length,
      skippedCount: transferResult.skipped.length,
      transferredBookingIds: transferResult.transferred.map((item) => item.bookingId),
      transferredBookings: transferResult.transferred.map((item) => ({
        bookingId: item.bookingId,
        userId: item.userId,
        studentName: item.studentName,
        studentEmail: item.studentEmail,
        status: item.status,
        startTime: item.startTime,
        endTime: item.endTime,
      })),
      skipped: transferResult.skipped.map((item) => ({
        bookingId: item.bookingId,
        userId: item.userId,
        studentName: item.studentName,
        studentEmail: item.studentEmail,
        startTime: item.startTime,
        endTime: item.endTime,
        wasCancelled: item.wasCancelled,
        reason: item.reason,
      })),
      sourceBoothStatusAfterTransfer: transferResult.sourceStatusAfterTransfer,
    };
  }

  /**
   * Get count of active booths (used by booking validation)
   */
  async getActiveBoothCount(): Promise<number> {
    return this.prisma.booth.count({ where: { status: 'ACTIVE' } });
  }

  /**
   * Get available booths for a specific date and time range
   */
  async getAvailableBooths(date: Date, startTime: Date, endTime: Date) {
    const activeBooths = await this.prisma.booth.findMany({
      where: { status: 'ACTIVE' },
    });

    // Find booths that have conflicting bookings
    const busyBoothIds = await this.prisma.booking.findMany({
      where: {
        date,
        status: { in: ['CONFIRM', 'CHECKED_IN'] },
        OR: [{ startTime: { lt: endTime }, endTime: { gt: startTime } }],
      },
      select: { boothId: true },
    });

    const busyIds = new Set(busyBoothIds.map((b) => b.boothId));
    return activeBooths.filter((booth) => !busyIds.has(booth.id));
  }

  async generateActivationOtp(boothCode: string, userRole: string, userId: string) {
    await this.assertBoothManagementPermission(userId, userRole, 'tạo OTP kích hoạt booth');

    const normalizedCode = this.normalizeBoothCode(boothCode);
    const booth = await this.prisma.booth.findFirst({
      where: {
        OR: [{ code: normalizedCode }, { name: normalizedCode }],
      },
    });

    if (!booth) {
      throw new NotFoundException('Booth code không tồn tại');
    }

    if (booth.status !== 'ACTIVE') {
      throw new BadRequestException('Booth không ở trạng thái ACTIVE');
    }

    if (booth.sessionTokenHash) {
      throw new ConflictException(
        'Booth đang có phiên kiosk hoạt động trên một thiết bị/trình duyệt khác. Vui lòng đăng xuất trước khi tạo OTP mới',
      );
    }

    const otp = this.generateNumericOtp(6);
    const otpHash = await bcrypt.hash(otp, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getOtpTtlMinutes() * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.booth.update({
        where: { id: booth.id },
        data: {
          activationOtpHash: otpHash,
          activationOtpExpiresAt: expiresAt,
          activationOtpUsedAt: null,
          activationOtpAttempts: 0,
        },
      });

      await this.appendBoothActivityLog(
        booth.id,
        booth.status,
        `Tạo OTP kích hoạt booth (hết hạn lúc ${this.formatVnDateTime(expiresAt)})`,
        userId,
        tx,
      );
    });

    this.realtimeService.notify({
      boothId: booth.id,
      message: `Đã tạo OTP kích hoạt cho booth ${booth.code || booth.name}`,
      level: 'info',
      emittedAt: new Date().toISOString(),
    });

    return {
      boothId: booth.id,
      boothCode: booth.code || booth.name,
      otp,
      expiresAt,
      expiresAtLocal: this.formatVnDateTime(expiresAt),
    };
  }

  async activateBoothSession(
    boothCode: string,
    otp: string,
    bindingContext: BoothSessionBindingContext,
  ) {
    const normalizedCode = this.normalizeBoothCode(boothCode);
    const booth = await this.prisma.booth.findFirst({
      where: {
        OR: [{ code: normalizedCode }, { name: normalizedCode }],
      },
    });

    if (!booth) {
      throw new NotFoundException('Booth code không tồn tại');
    }

    if (booth.status !== 'ACTIVE') {
      throw new BadRequestException('Booth không ở trạng thái ACTIVE');
    }

    if (booth.sessionTokenHash) {
      throw new ConflictException(
        'Booth đã được kích hoạt trên một thiết bị/trình duyệt khác. Vui lòng đăng xuất booth hiện tại trước khi kích hoạt lại',
      );
    }

    if (!booth.activationOtpHash || !booth.activationOtpExpiresAt) {
      throw new BadRequestException('Booth chưa có OTP kích hoạt hợp lệ');
    }

    if (booth.activationOtpUsedAt) {
      throw new BadRequestException('OTP đã được sử dụng');
    }

    const now = new Date();

    if (booth.activationOtpExpiresAt < now) {
      throw new BadRequestException('OTP đã hết hạn');
    }

    if (booth.activationOtpAttempts >= this.getOtpMaxAttempts()) {
      throw new ForbiddenException('OTP đã vượt số lần thử tối đa');
    }

    const isValidOtp = await bcrypt.compare(otp, booth.activationOtpHash);

    if (!isValidOtp) {
      await this.prisma.booth.update({
        where: { id: booth.id },
        data: { activationOtpAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException('OTP không hợp lệ');
    }

    const activatedAt = now;
    const boothBindingHash = this.createBoothSessionBindingHash(
      bindingContext.boothClientId,
      bindingContext.userAgent,
    );
    const boothSessionToken = this.jwtService.sign(
      {
        boothId: booth.id,
        boothCode: booth.code || booth.name,
        scope: 'booth-session',
        boothBindingHash,
      },
      {
        secret: this.getBoothSessionSecret(),
      },
    );
    const sessionTokenHash = await bcrypt.hash(boothSessionToken, 10);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.booth.updateMany({
        where: {
          id: booth.id,
          status: 'ACTIVE',
          sessionTokenHash: null,
          activationOtpUsedAt: null,
          activationOtpHash: booth.activationOtpHash,
          activationOtpExpiresAt: {
            gte: activatedAt,
          },
        },
        data: {
          activationOtpUsedAt: activatedAt,
          activationOtpAttempts: 0,
          sessionTokenHash,
          sessionActivatedAt: activatedAt,
        },
      });

      if (claimed.count === 0) {
        throw new ConflictException(
          'Booth đã được kích hoạt trên một thiết bị/trình duyệt khác. Vui lòng đăng xuất booth hiện tại trước khi kích hoạt lại',
        );
      }

      await this.appendBoothActivityLog(
        booth.id,
        booth.status,
        'Kiosk đăng nhập thành công bằng OTP kích hoạt',
        null,
        tx,
      );
    });

    this.realtimeService.notify({
      boothId: booth.id,
      message: `Booth ${booth.code || booth.name} đã đăng nhập kiosk`,
      level: 'success',
      emittedAt: new Date().toISOString(),
    });

    return {
      boothId: booth.id,
      boothCode: booth.code || booth.name,
      boothName: booth.name,
      sessionActivatedAt: activatedAt,
      sessionActivatedAtLocal: this.formatVnDateTime(activatedAt),
      boothSessionToken,
    };
  }

  async validateBoothSessionToken(
    boothSessionToken: string,
    bindingContext: BoothSessionBindingContext,
  ) {
    let payload: {
      boothId: string;
      boothCode: string;
      scope: string;
      boothBindingHash?: string;
    };

    try {
      payload = this.jwtService.verify(boothSessionToken, {
        secret: this.getBoothSessionSecret(),
      });
    } catch {
      throw new UnauthorizedException('Booth session token không hợp lệ');
    }

    if (payload.scope !== 'booth-session') {
      throw new UnauthorizedException('Booth session token không hợp lệ');
    }

    const expectedBindingHash = this.createBoothSessionBindingHash(
      bindingContext.boothClientId,
      bindingContext.userAgent,
    );

    if (!payload.boothBindingHash || payload.boothBindingHash !== expectedBindingHash) {
      throw new UnauthorizedException(
        'Booth session chỉ hợp lệ trên thiết bị/trình duyệt đã kích hoạt',
      );
    }

    const booth = await this.prisma.booth.findUnique({ where: { id: payload.boothId } });
    if (!booth) {
      throw new UnauthorizedException('Booth không tồn tại');
    }

    if (booth.status !== 'ACTIVE') {
      throw new ForbiddenException('Booth không ở trạng thái ACTIVE');
    }

    if (!booth.sessionTokenHash) {
      throw new UnauthorizedException('Booth session đã hết hiệu lực');
    }

    const tokenMatched = await bcrypt.compare(boothSessionToken, booth.sessionTokenHash);
    if (!tokenMatched) {
      throw new UnauthorizedException('Booth session token không hợp lệ');
    }

    return booth;
  }

  async deactivateBoothSession(
    boothSessionToken: string,
    bindingContext: BoothSessionBindingContext,
    userId?: string,
  ) {
    const booth = await this.validateBoothSessionToken(boothSessionToken, bindingContext);

    await this.prisma.$transaction(async (tx) => {
      await tx.booth.update({
        where: { id: booth.id },
        data: {
          sessionTokenHash: null,
        },
      });

      await this.appendBoothActivityLog(
        booth.id,
        booth.status,
        'Kiosk đăng xuất khỏi booth',
        userId || null,
        tx,
      );
    });

    this.realtimeService.notify({
      boothId: booth.id,
      message: `Booth ${booth.code || booth.name} đã đăng xuất kiosk`,
      level: 'warning',
      emittedAt: new Date().toISOString(),
    });

    return { message: 'Đăng xuất booth thành công' };
  }

  async forceDeactivateBoothSessionByBoothId(
    boothId: string,
    reason: string,
    userRole: string,
    userId: string,
  ) {
    await this.assertMonitoringPermission(userId, userRole, 'buộc đăng xuất kiosk booth');

    const booth = await this.prisma.booth.findUnique({ where: { id: boothId } });
    if (!booth) {
      throw new NotFoundException('Booth không tồn tại');
    }

    if (!booth.sessionTokenHash) {
      return { message: 'Booth hiện không có phiên kiosk đang hoạt động', boothId };
    }

    const activeBooking = await this.prisma.booking.findFirst({
      where: {
        boothId: booth.id,
        status: 'CHECKED_IN',
      },
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

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.booth.update({
        where: { id: booth.id },
        data: {
          sessionTokenHash: null,
        },
      });

      if (activeBooking) {
        await tx.booking.update({
          where: { id: activeBooking.id },
          data: {
            status: 'COMPLETED',
            checkedOutAt: now,
          },
        });

        await tx.examSession.updateMany({
          where: { bookingId: activeBooking.id, status: 'IN_PROGRESS' },
          data: { status: 'SUBMITTED', finishedAt: now },
        });

        await tx.practiceSession.updateMany({
          where: { bookingId: activeBooking.id, status: 'IN_PROGRESS' },
          data: { status: 'ABANDONED', finishedAt: now },
        });
      }

      await this.appendBoothActivityLog(
        booth.id,
        booth.status,
        `Buộc kiosk đăng xuất. Lý do: ${reason}`,
        userId,
        tx,
      );
    });

    const emittedAt = now.toISOString();

    if (activeBooking) {
      this.realtimeService.bookingCheckout({
        bookingId: activeBooking.id,
        boothId: activeBooking.boothId,
        userId: activeBooking.userId,
        status: 'COMPLETED',
        type: activeBooking.type,
        startTime: activeBooking.startTime.toISOString(),
        endTime: activeBooking.endTime.toISOString(),
        checkedOutAt: emittedAt,
        emittedAt,
      });

      for (const examSession of activeBooking.examSessions) {
        this.realtimeService.sessionTerminated({
          sessionType: 'EXAM',
          sessionId: examSession.id,
          userId: activeBooking.userId,
          boothId: activeBooking.boothId,
          status: 'SUBMITTED',
          reason,
          emittedAt,
        });
      }

      for (const practiceSession of activeBooking.practiceSessions) {
        this.realtimeService.sessionTerminated({
          sessionType: 'PRACTICE',
          sessionId: practiceSession.id,
          userId: activeBooking.userId,
          boothId: activeBooking.boothId,
          status: 'ABANDONED',
          reason,
          emittedAt,
        });
      }
    }

    this.realtimeService.notify({
      boothId: booth.id,
      message: `Booth ${booth.code || booth.name} bị buộc đăng xuất kiosk. Lý do: ${reason}`,
      level: 'warning',
      emittedAt,
    });

    this.realtimeService.monitoringUpdated({
      scope: 'BOOTH',
      action: 'FORCE_LOGOUT_BOOTH',
      boothId: booth.id,
      emittedAt,
    });

    return {
      message: 'Buộc đăng xuất kiosk booth thành công',
      boothId: booth.id,
      boothCode: booth.code || booth.name,
    };
  }

  async getBoothSessionStatus(
    boothSessionToken: string,
    bindingContext: BoothSessionBindingContext,
  ) {
    const booth = await this.validateBoothSessionToken(boothSessionToken, bindingContext);

    return {
      active: true,
      booth: {
        id: booth.id,
        code: booth.code || booth.name,
        name: booth.name,
        status: booth.status,
      },
      sessionActivatedAt: booth.sessionActivatedAt,
      sessionActivatedAtLocal: booth.sessionActivatedAt
        ? this.formatVnDateTime(booth.sessionActivatedAt)
        : null,
    };
  }
}
