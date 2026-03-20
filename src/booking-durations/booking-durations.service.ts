import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateBookingDurationDto,
  QueryBookingDurationDto,
  UpdateBookingDurationDto,
} from './dto/booking-duration.dto';
import type { BookingType, Prisma } from '@prisma/client';

@Injectable()
export class BookingDurationsService {
  constructor(private readonly prisma: PrismaService) {}

  private ensureAdmin(userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể quản lý thời lượng booking');
    }
  }

  private buildOrderBy(): Prisma.BookingDurationOptionOrderByWithRelationInput[] {
    return [{ displayOrder: 'asc' }, { durationMinutes: 'asc' }];
  }

  private ensureChangedPayload(data: Prisma.BookingDurationOptionUpdateInput) {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Không có dữ liệu để cập nhật');
    }
  }

  async findAll(query: QueryBookingDurationDto) {
    const where: Prisma.BookingDurationOptionWhereInput = {};

    if (query.type) {
      where.type = query.type as BookingType;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return this.prisma.bookingDurationOption.findMany({
      where,
      orderBy: this.buildOrderBy(),
    });
  }

  async create(dto: CreateBookingDurationDto, userRole: string) {
    this.ensureAdmin(userRole);

    const exists = await this.prisma.bookingDurationOption.findUnique({
      where: {
        type_durationMinutes: {
          type: dto.type,
          durationMinutes: dto.durationMinutes,
        },
      },
    });

    if (exists) {
      throw new ConflictException('Thời lượng này đã tồn tại cho loại booking đã chọn');
    }

    return this.prisma.bookingDurationOption.create({
      data: {
        type: dto.type,
        durationMinutes: dto.durationMinutes,
        isActive: dto.isActive ?? true,
        displayOrder: dto.displayOrder ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateBookingDurationDto, userRole: string) {
    this.ensureAdmin(userRole);

    const current = await this.prisma.bookingDurationOption.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Không tìm thấy cấu hình thời lượng');
    }

    const nextType = dto.type ?? current.type;
    const nextDuration = dto.durationMinutes ?? current.durationMinutes;

    const duplicated = await this.prisma.bookingDurationOption.findFirst({
      where: {
        id: { not: id },
        type: nextType,
        durationMinutes: nextDuration,
      },
    });

    if (duplicated) {
      throw new ConflictException('Đã tồn tại thời lượng trùng cho loại booking này');
    }

    const data: Prisma.BookingDurationOptionUpdateInput = {};

    if (dto.type !== undefined) data.type = dto.type;
    if (dto.durationMinutes !== undefined) data.durationMinutes = dto.durationMinutes;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.displayOrder !== undefined) data.displayOrder = dto.displayOrder;

    this.ensureChangedPayload(data);

    return this.prisma.bookingDurationOption.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, userRole: string) {
    this.ensureAdmin(userRole);

    const existing = await this.prisma.bookingDurationOption.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Không tìm thấy cấu hình thời lượng');
    }

    await this.prisma.bookingDurationOption.delete({ where: { id } });
    return { message: 'Xóa cấu hình thời lượng thành công' };
  }
}
