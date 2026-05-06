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
    userId: string,
    type: PointType,
    points: number,
    reason: string,
    refs?: { bookingId?: string; examSessionId?: string },
  ) {
    const [transaction] = await this.prisma.$transaction([
      this.prisma.pointTransaction.create({
        data: {
          userId,
          type,
          points,
          reason,
          bookingId: refs?.bookingId || null,
          examSessionId: refs?.examSessionId || null,
        },
      }),
      this.prisma.pointAccount.upsert({
        where: { userId },
        update: { totalPoints: { increment: points } },
        create: { userId, totalPoints: points },
      }),
    ]);

    return transaction;
  }

  /**
   * Get user's total points
   */
  async getMyPoints(userId: string) {
    const pointAccount = await this.prisma.pointAccount.findUnique({
      where: { userId },
    });

    if (!pointAccount) throw new NotFoundException('Người dùng không tồn tại');
    return { totalPoints: pointAccount.totalPoints };
  }

  /**
   * Get user's point transaction history
   */
  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.pointTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.pointTransaction.count({ where: { userId } }),
    ]);

    return {
      data: transactions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get leaderboard (top students by points)
   */
  async getLeaderboard(limit = 20) {
    const pointAccounts = await this.prisma.pointAccount.findMany({
      where: {
        user: { role: 'STUDENT', auth: { isLocked: false } },
      },
      orderBy: { totalPoints: 'desc' },
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            studentCode: true,
          },
        },
      },
    });

    return pointAccounts.map((pa, index) => ({
      rank: index + 1,
      id: pa.user.id,
      name: pa.user.name,
      email: pa.user.email,
      studentCode: pa.user.studentCode,
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
