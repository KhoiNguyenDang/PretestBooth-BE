import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PointType } from '@prisma/client';

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Award or deduct points for a user
   */
  async addTransaction(
    studentOrUserId: string,
    type: PointType,
    points: number,
    reason: string,
    refs?: { bookingId?: string; examSessionId?: string },
  ) {
    const student =
      (await this.prisma.student.findUnique({
        where: { id: studentOrUserId },
      })) ||
      (await this.prisma.student.findUnique({
        where: { userId: studentOrUserId },
      }));

    if (!student) throw new Error('Sinh viên không tồn tại');

    const [transaction] = await this.prisma.$transaction([
      this.prisma.pointTransaction.create({
        data: {
          studentId: student.id,
          type,
          points,
          reason,
          bookingId: refs?.bookingId || null,
          examSessionId: refs?.examSessionId || null,
        },
      }),
      this.prisma.pointAccount.upsert({
        where: { studentId: student.id },
        update: { totalPoints: { increment: points } },
        create: { studentId: student.id, totalPoints: points },
      }),
    ]);

    return transaction;
  }

  /**
   * Get user's total points
   */
  async getMyPoints(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });

    if (!user?.studentProfile) throw new NotFoundException('Sinh viên không tồn tại');

    const pointAccount = await this.prisma.pointAccount.findUnique({
      where: { studentId: user.studentProfile.id },
    });

    if (!pointAccount) throw new NotFoundException('Tài khoản điểm không tồn tại');
    return { totalPoints: pointAccount.totalPoints };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { studentProfile: true },
    });

    if (!user?.studentProfile) throw new NotFoundException('Sinh viên không tồn tại');

    const [transactions, total] = await Promise.all([
      this.prisma.pointTransaction.findMany({
        where: { studentId: user.studentProfile.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.pointTransaction.count({ where: { studentId: user.studentProfile.id } }),
    ]);

    return {
      data: transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getLeaderboard(limit = 20) {
    const pointAccounts = await this.prisma.pointAccount.findMany({
      where: {
        student: {
          user: { role: 'STUDENT', auth: { isLocked: false } },
        },
      },
      orderBy: { totalPoints: 'desc' },
      take: limit,
      include: {
        student: {
          select: {
            studentCode: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return pointAccounts.map((pa, index) => ({
      rank: index + 1,
      id: pa.student.user.id,
      name: pa.student.user.name,
      email: pa.student.user.email,
      studentCode: pa.student.studentCode ?? null,
      totalPoints: pa.totalPoints,
    }));
  }

  /**
   * Manual point adjustment by admin
   */
  async manualAdjust(adminRole: string, targetUserId: string, points: number, reason: string) {
    if (adminRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể điều chỉnh điểm');
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    return this.addTransaction(targetUserId, 'MANUAL_ADJUSTMENT', points, reason);
  }
}
