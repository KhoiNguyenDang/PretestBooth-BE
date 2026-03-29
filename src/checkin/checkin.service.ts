import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FaceRecognitionService } from '../face/face-recognition.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CheckinVerifyDto } from './dto/checkin-verify.dto';

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly realtimeService: RealtimeService,
  ) {}

  private getCheckInEarlyMinutes() {
    return Number(process.env.CHECKIN_EARLY_MINUTES || 15);
  }

  private getCheckInLateMinutes() {
    return Number(process.env.CHECKIN_LATE_MINUTES || 0);
  }

  private getNowInVietnamConvention() {
    return new Date(Date.now() + 7 * 60 * 60 * 1000);
  }

  private isWithinCheckInWindow(startTime: Date, endTime: Date, now: Date) {
    const earliestCheckIn = new Date(startTime.getTime() - this.getCheckInEarlyMinutes() * 60 * 1000);
    const latestCheckIn = new Date(endTime.getTime() + this.getCheckInLateMinutes() * 60 * 1000);

    return now >= earliestCheckIn && now <= latestCheckIn;
  }

  private getStoredEmbedding(faceEmbedding: Prisma.JsonValue | null): number[] {
    if (!Array.isArray(faceEmbedding) || faceEmbedding.length === 0) {
      throw new ForbiddenException('Người dùng chưa có dữ liệu khuôn mặt. Vui lòng hoàn tất KYC.');
    }

    const embedding = faceEmbedding.map((item) => Number(item));
    if (embedding.some((value) => !Number.isFinite(value))) {
      throw new BadRequestException('Dữ liệu khuôn mặt đã lưu không hợp lệ');
    }

    return this.faceRecognitionService.normalize(embedding);
  }

  async verify(userId: string, userRole: string, dto: CheckinVerifyDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        booth: { select: { id: true, name: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking không tồn tại');
    }

    if (userRole === 'STUDENT' && booking.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xác thực check-in cho booking này');
    }

    if (!['CONFIRMED', 'CHECKED_IN'].includes(booking.status)) {
      throw new BadRequestException('Booking không ở trạng thái cho phép check-in');
    }

    const now = this.getNowInVietnamConvention();
    if (!this.isWithinCheckInWindow(booking.startTime, booking.endTime, now)) {
      throw new ForbiddenException('Hiện tại không nằm trong khung giờ check-in cho booking này');
    }

    const bookingUser = await this.prisma.user.findUnique({
      where: { id: booking.userId },
      select: {
        id: true,
        kycStatus: true,
        faceEmbedding: true,
      },
    });

    if (!bookingUser) {
      throw new NotFoundException('Người dùng của booking không tồn tại');
    }

    if (bookingUser.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException('Người dùng chưa hoàn tất xác minh KYC');
    }

    const threshold = dto.threshold ?? booking.checkinThreshold ?? 0.85;

    if (!dto.liveness.passed) {
      await this.prisma.bookingCheckinAttempt.create({
        data: {
          bookingId: booking.id,
          userId: booking.userId,
          similarityScore: 0,
          threshold,
          isMatch: false,
          livenessPassed: false,
          failReason: 'LIVENESS_FAILED',
          verifierDeviceId: dto.verifierDeviceId,
        },
      });

      await this.prisma.booking.update({
        where: { id: booking.id },
        data: {
          checkinStatus: 'FAILED',
          checkinSimilarityScore: 0,
          checkinThreshold: threshold,
          checkinAttemptCount: { increment: 1 },
        },
      });

      return {
        bookingId: booking.id,
        matched: false,
        similarityScore: 0,
        threshold,
        reason: 'Liveness không đạt',
      };
    }

    const storedEmbedding = this.getStoredEmbedding(bookingUser.faceEmbedding);
    const liveEmbeddingResult = await this.faceRecognitionService.extractEmbedding(dto.image);
    const similarityScore = this.faceRecognitionService.cosineSimilarity(
      storedEmbedding,
      liveEmbeddingResult.embedding,
    );
    const matched = similarityScore > threshold;

    await this.prisma.bookingCheckinAttempt.create({
      data: {
        bookingId: booking.id,
        userId: booking.userId,
        similarityScore,
        threshold,
        isMatch: matched,
        livenessPassed: true,
        failReason: matched ? null : 'LOW_SIMILARITY',
        verifierDeviceId: dto.verifierDeviceId,
      },
    });

    const updatedBooking = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        checkinStatus: matched ? 'PASSED' : 'FAILED',
        checkinSimilarityScore: similarityScore,
        checkinThreshold: threshold,
        checkinVerifiedAt: matched ? now : null,
        checkinAttemptCount: { increment: 1 },
        ...(matched && booking.status !== 'CHECKED_IN'
          ? {
              status: 'CHECKED_IN',
              checkedInAt: now,
            }
          : {}),
      },
    });

    if (matched && booking.status !== 'CHECKED_IN') {
      this.realtimeService.bookingCheckin({
        bookingId: updatedBooking.id,
        boothId: updatedBooking.boothId,
        userId: updatedBooking.userId,
        status: 'CHECKED_IN',
        type: updatedBooking.type,
        startTime: updatedBooking.startTime.toISOString(),
        endTime: updatedBooking.endTime.toISOString(),
        checkedInAt: updatedBooking.checkedInAt?.toISOString(),
        emittedAt: new Date().toISOString(),
      });

      this.realtimeService.notify({
        userId: updatedBooking.userId,
        boothId: updatedBooking.boothId,
        message: 'Xác thực khuôn mặt thành công. Check-in đã được ghi nhận.',
        level: 'success',
        emittedAt: new Date().toISOString(),
      });
    }

    return {
      bookingId: updatedBooking.id,
      matched,
      similarityScore,
      threshold,
      checkinStatus: updatedBooking.checkinStatus,
      bookingStatus: updatedBooking.status,
      checkedInAt: updatedBooking.checkedInAt,
    };
  }
}
