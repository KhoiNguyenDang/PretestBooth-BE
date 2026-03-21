import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBoothDto, UpdateBoothDto, QueryBoothDto } from './dto/booth.dto';
import type { BoothStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class BoothsService {
  private static readonly VIETNAM_TZ = 'Asia/Ho_Chi_Minh';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly realtimeService: RealtimeService,
  ) {}

  private getOtpTtlMinutes() {
    return Number(process.env.BOOTH_OTP_TTL_MINUTES || 10);
  }

  private getOtpMaxAttempts() {
    return Number(process.env.BOOTH_OTP_MAX_ATTEMPTS || 5);
  }

  private getBoothSessionSecret() {
    return process.env.BOOTH_SESSION_SECRET || process.env.JWT_ACCESS_SECRET || 'booth-session-secret';
  }

  private normalizeBoothCode(code: string) {
    return code.trim().toUpperCase();
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

  async create(dto: CreateBoothDto, userRole: string) {
    if (!['ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể tạo booth');
    }

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

    return this.prisma.booth.create({
      data: {
        name: dto.name,
        code: normalizedCode,
        description: dto.description || null,
        location: dto.location || null,
      },
    });
  }

  async findAll(query: QueryBoothDto) {
    const where: Prisma.BoothWhereInput = {};
    if (query.status) {
      where.status = query.status as BoothStatus;
    }

    return this.prisma.booth.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { bookings: true } },
      },
    });
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
    return booth;
  }

  async update(id: string, dto: UpdateBoothDto, userRole: string, userId: string) {
    if (!['ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể cập nhật booth');
    }

    const booth = await this.prisma.booth.findUnique({ where: { id } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');

    if (dto.name && dto.name !== booth.name) {
      const nameExists = await this.prisma.booth.findUnique({ where: { name: dto.name } });
      if (nameExists) throw new ConflictException(`Tên booth "${dto.name}" đã tồn tại`);
    }

    const normalizedCode = dto.code === null ? null : dto.code ? this.normalizeBoothCode(dto.code) : undefined;
    if (normalizedCode && normalizedCode !== booth.code) {
      const codeExists = await this.prisma.booth.findUnique({ where: { code: normalizedCode } });
      if (codeExists) throw new ConflictException(`Mã booth "${normalizedCode}" đã tồn tại`);
    }

    const isStatusChanged = dto.status && dto.status !== booth.status;

    const txResult = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booth.update({
        where: { id },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(normalizedCode !== undefined && { code: normalizedCode }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.location !== undefined && { location: dto.location }),
          ...(dto.status && { status: dto.status as BoothStatus }),
        },
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

    return txResult.updated;
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

  async remove(id: string, userRole: string) {
    if (!['ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể xóa booth');
    }

    const booth = await this.prisma.booth.findUnique({ where: { id } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');

    await this.prisma.booth.delete({ where: { id } });
    return { message: 'Xóa booth thành công' };
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
        status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
        OR: [
          { startTime: { lt: endTime }, endTime: { gt: startTime } },
        ],
      },
      select: { boothId: true },
    });

    const busyIds = new Set(busyBoothIds.map((b) => b.boothId));
    return activeBooths.filter((booth) => !busyIds.has(booth.id));
  }

  async generateActivationOtp(boothCode: string, userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể tạo OTP kích hoạt booth');
    }

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

    const otp = this.generateNumericOtp(6);
    const otpHash = await bcrypt.hash(otp, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getOtpTtlMinutes() * 60 * 1000);

    await this.prisma.booth.update({
      where: { id: booth.id },
      data: {
        activationOtpHash: otpHash,
        activationOtpExpiresAt: expiresAt,
        activationOtpUsedAt: null,
        activationOtpAttempts: 0,
      },
    });

    return {
      boothId: booth.id,
      boothCode: booth.code || booth.name,
      otp,
      expiresAt,
      expiresAtLocal: this.formatVnDateTime(expiresAt),
    };
  }

  async activateBoothSession(boothCode: string, otp: string) {
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
    const boothSessionToken = this.jwtService.sign(
      {
        boothId: booth.id,
        boothCode: booth.code || booth.name,
        scope: 'booth-session',
      },
      {
        secret: this.getBoothSessionSecret(),
      },
    );

    await this.prisma.booth.update({
      where: { id: booth.id },
      data: {
        activationOtpUsedAt: activatedAt,
        activationOtpAttempts: 0,
        sessionTokenHash: await bcrypt.hash(boothSessionToken, 10),
        sessionActivatedAt: activatedAt,
      },
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

  async validateBoothSessionToken(boothSessionToken: string) {
    let payload: { boothId: string; boothCode: string; scope: string };

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

  async deactivateBoothSession(boothSessionToken: string) {
    const booth = await this.validateBoothSessionToken(boothSessionToken);

    await this.prisma.booth.update({
      where: { id: booth.id },
      data: {
        sessionTokenHash: null,
      },
    });

    return { message: 'Đăng xuất booth thành công' };
  }

  async getBoothSessionStatus(boothSessionToken: string) {
    const booth = await this.validateBoothSessionToken(boothSessionToken);

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
