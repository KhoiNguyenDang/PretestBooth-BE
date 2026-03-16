import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBoothDto, UpdateBoothDto, QueryBoothDto } from './dto/booth.dto';
import type { BoothStatus, Prisma } from '@prisma/client';

@Injectable()
export class BoothsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBoothDto, userRole: string) {
    if (!['ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể tạo booth');
    }

    const exists = await this.prisma.booth.findUnique({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Booth "${dto.name}" đã tồn tại`);
    }

    return this.prisma.booth.create({
      data: {
        name: dto.name,
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
      },
    });

    if (!booth) throw new NotFoundException('Booth không tồn tại');
    return booth;
  }

  async update(id: string, dto: UpdateBoothDto, userRole: string) {
    if (!['ADMIN'].includes(userRole)) {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể cập nhật booth');
    }

    const booth = await this.prisma.booth.findUnique({ where: { id } });
    if (!booth) throw new NotFoundException('Booth không tồn tại');

    if (dto.name && dto.name !== booth.name) {
      const nameExists = await this.prisma.booth.findUnique({ where: { name: dto.name } });
      if (nameExists) throw new ConflictException(`Tên booth "${dto.name}" đã tồn tại`);
    }

    return this.prisma.booth.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.status && { status: dto.status as BoothStatus }),
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
}
