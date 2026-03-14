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
      this.prisma.user.update({
        where: { id: userId },
        data: { totalPoints: { increment: points } },
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
      select: { totalPoints: true },
    });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return { totalPoints: user.totalPoints };
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
    const users = await this.prisma.user.findMany({
      where: { role: 'STUDENT', isLocked: false },
      orderBy: { totalPoints: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        studentCode: true,
        totalPoints: true,
      },
    });

    return users.map((u, index) => ({ rank: index + 1, ...u }));
  }

  /**
   * Manual point adjustment by admin
   */
  async manualAdjust(
    adminRole: string,
    targetUserId: string,
    points: number,
    reason: string,
  ) {
    if (adminRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể điều chỉnh điểm');
    }

    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    return this.addTransaction(targetUserId, 'MANUAL_ADJUSTMENT', points, reason);
  }
}
