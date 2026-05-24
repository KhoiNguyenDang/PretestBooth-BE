import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { FaceRecognitionService } from '../face/face-recognition.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { CheckinVerifyDto } from './dto/checkin-verify.dto';

const CHECKIN_THRESHOLD_SETTING_KEY = 'CHECKIN_SIMILARITY_THRESHOLD';
const DEFAULT_CHECKIN_THRESHOLD = 0.6;
const MIN_CHECKIN_THRESHOLD = 0.2;
const MAX_CHECKIN_THRESHOLD = 0.99;
const EXAM_FALLBACK_MAX_FAILED_ATTEMPTS = 5;

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly realtimeService: RealtimeService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private getCheckInEarlyMinutes() {
    return Number(process.env.CHECKIN_EARLY_MINUTES || 15);
  }

  private getCheckInLateMinutes() {
    return Number(process.env.CHECKIN_LATE_MINUTES || 0);
  }

  private ensureAdmin(userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới được cập nhật ngưỡng xác thực khuôn mặt');
    }
  }

  private async resolveLecturerIdByUserId(userId: string): Promise<string | null> {
    const lecturer = await this.prisma.lecturer.findUnique({
      where: { userId },
      select: { id: true },
    });
    return lecturer?.id ?? null;
  }

  private parseThreshold(rawValue: string | null | undefined): number | null {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return null;
    }

    if (value < MIN_CHECKIN_THRESHOLD || value > MAX_CHECKIN_THRESHOLD) {
      return null;
    }

    return value;
  }

  async getCheckinThresholdConfig() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: CHECKIN_THRESHOLD_SETTING_KEY },
    });

    const thresholdFromDb = this.parseThreshold(setting?.value);
    if (thresholdFromDb !== null) {
      return {
        key: CHECKIN_THRESHOLD_SETTING_KEY,
        threshold: thresholdFromDb,
        source: 'database' as const,
        updatedAt: setting?.updatedAt ?? null,
      };
    }

    const thresholdFromEnv = this.parseThreshold(process.env.CHECKIN_SIMILARITY_THRESHOLD);
    if (thresholdFromEnv !== null) {
      return {
        key: CHECKIN_THRESHOLD_SETTING_KEY,
        threshold: thresholdFromEnv,
        source: 'env' as const,
        updatedAt: setting?.updatedAt ?? null,
      };
    }

    return {
      key: CHECKIN_THRESHOLD_SETTING_KEY,
      threshold: DEFAULT_CHECKIN_THRESHOLD,
      source: 'default' as const,
      updatedAt: setting?.updatedAt ?? null,
    };
  }

  async updateCheckinThreshold(userRole: string, userId: string, threshold: number) {
    this.ensureAdmin(userRole);
    const actorLecturerId = await this.resolveLecturerIdByUserId(userId);

    if (!Number.isFinite(threshold)) {
      throw new BadRequestException('Ngưỡng xác thực không hợp lệ');
    }

    if (threshold < MIN_CHECKIN_THRESHOLD || threshold > MAX_CHECKIN_THRESHOLD) {
      throw new BadRequestException(
        `Ngưỡng xác thực phải nằm trong khoảng ${MIN_CHECKIN_THRESHOLD} - ${MAX_CHECKIN_THRESHOLD}`,
      );
    }

    const normalizedThreshold = Number(threshold.toFixed(2));

    const savedSetting = await this.prisma.systemSetting.upsert({
      where: { key: CHECKIN_THRESHOLD_SETTING_KEY },
      update: {
        value: String(normalizedThreshold),
        updatedByLecturerId: actorLecturerId,
      },
      create: {
        key: CHECKIN_THRESHOLD_SETTING_KEY,
        value: String(normalizedThreshold),
        description: 'Cosine similarity threshold for booth face check-in verification',
        updatedByLecturerId: actorLecturerId,
      },
    });

    return {
      key: CHECKIN_THRESHOLD_SETTING_KEY,
      threshold: normalizedThreshold,
      source: 'database' as const,
      updatedAt: savedSetting.updatedAt,
      updatedByLecturerId: savedSetting.updatedByLecturerId,
    };
  }

  private getNowInVietnamConvention() {
    return new Date();
  }

  private isWithinCheckInWindow(startTime: Date, endTime: Date, now: Date) {
    const earliestCheckIn = new Date(
      startTime.getTime() - this.getCheckInEarlyMinutes() * 60 * 1000,
    );
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
        student: { select: { id: true, userId: true } },
        booth: { select: { id: true, name: true, status: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking không tồn tại');
    }

    if (userRole === 'STUDENT' && booking.student?.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xác thực check-in cho booking này');
    }

    if (!['CONFIRM', 'CHECKED_IN'].includes(booking.status)) {
      throw new BadRequestException('Booking không ở trạng thái cho phép check-in');
    }

    const boothStatus = String(booking.booth.status);

    if (boothStatus === 'MAINTENANCE_PENDING') {
      throw new ForbiddenException(
        'Booth đang ở trạng thái sự cố, không thể thực hiện check-in tại booth này',
      );
    }

    if (boothStatus !== 'ACTIVE') {
      throw new ForbiddenException('Booth hiện không hoạt động');
    }

    const now = this.getNowInVietnamConvention();
    if (!this.isWithinCheckInWindow(booking.startTime, booking.endTime, now)) {
      throw new ForbiddenException('Hiện tại không nằm trong khung giờ check-in cho booking này');
    }

    const bookingUser = await this.prisma.userKyc.findUnique({
      where: { userId: booking.student?.userId ?? '' },
      select: {
        userId: true,
        kycStatus: true,
        user: {
          select: {
            faceEmbeddingRecord: {
              select: {
                faceEmbedding: true,
              },
            },
          },
        },
      },
    });

    if (!bookingUser) {
      throw new NotFoundException('Người dùng của booking không tồn tại');
    }

    if (bookingUser.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException('Người dùng chưa hoàn tất xác minh KYC');
    }

    const thresholdConfig = await this.getCheckinThresholdConfig();
    const threshold = thresholdConfig.threshold;

    const storedEmbedding = this.getStoredEmbedding(
      bookingUser.user.faceEmbeddingRecord?.faceEmbedding ?? null,
    );
    const liveEmbeddingResult = await this.faceRecognitionService.extractEmbedding(dto.image);
    const similarityScore = this.faceRecognitionService.cosineSimilarity(
      storedEmbedding,
      liveEmbeddingResult.embedding,
    );
    const matched = similarityScore > threshold;
    const attemptNumber = booking.checkinAttemptCount + 1;

    const fallbackPolicyEnabled = booking.type === 'EXAM';
    const fallbackActivated =
      !matched && fallbackPolicyEnabled && attemptNumber > EXAM_FALLBACK_MAX_FAILED_ATTEMPTS;

    let evidenceImageUrl: string | null = null;
    if (fallbackActivated) {
      evidenceImageUrl = await this.cloudinaryService.uploadCheckinEvidenceImage(dto.image);
    }

    await this.prisma.bookingCheckinAttempt.create({
      data: {
        bookingId: booking.id,
        studentId: booking.studentId,
        similarityScore,
        threshold,
        isMatch: matched,
        livenessPassed: true,
        failReason: matched ? null : fallbackActivated ? 'FALLBACK_ALLOWED' : 'LOW_SIMILARITY',
        evidenceImageUrl,
        verifierDeviceId: dto.verifierDeviceId,
      },
    });

    const resolvedCheckinStatus = matched
      ? 'PASSED'
      : fallbackActivated
        ? 'FAILED_BUT_ALLOWED'
        : 'FAILED';

    const shouldAllowEntry = matched || fallbackActivated;

    const updatedBooking = await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        checkinStatus: resolvedCheckinStatus as any,
        checkinSimilarityScore: similarityScore,
        checkinThreshold: threshold,
        checkinVerifiedAt: shouldAllowEntry ? now : null,
        checkinAttemptCount: matched ? 0 : { increment: 1 },
        fallbackAppliedAt: fallbackActivated ? now : null,
        fallbackEvidenceImageUrl: fallbackActivated ? evidenceImageUrl : null,
        ...(!shouldAllowEntry && booking.status === 'CHECKED_IN'
          ? {
              status: 'CONFIRM',
              checkedInAt: null,
            }
          : {}),
        ...(shouldAllowEntry && booking.status !== 'CHECKED_IN'
          ? {
              status: 'CHECKED_IN',
              checkedInAt: now,
            }
          : {}),
      },
      include: {
        student: { select: { userId: true } },
      },
    });

    await this.prisma.boothStatusLog.create({
      data: {
        boothId: updatedBooking.boothId,
        fromStatus: booking.booth.status,
        toStatus: booking.booth.status,
        note: shouldAllowEntry
          ? fallbackActivated
            ? `Sinh viên check-in fallback duoc phep (booking ${updatedBooking.id}, similarity=${similarityScore.toFixed(4)}, threshold=${threshold.toFixed(2)})`
            : `Sinh viên check-in thành công (booking ${updatedBooking.id}, similarity=${similarityScore.toFixed(4)})`
          : `Sinh viên check-in thất bại (booking ${updatedBooking.id}, similarity=${similarityScore.toFixed(4)})`,
        changedByLecturerId: null,
      },
    });

    if (shouldAllowEntry && booking.status !== 'CHECKED_IN') {
      this.realtimeService.bookingCheckin({
        bookingId: updatedBooking.id,
        boothId: updatedBooking.boothId,
        userId: updatedBooking.student?.userId ?? userId,
        status: 'CHECKED_IN',
        type: updatedBooking.type,
        startTime: updatedBooking.startTime.toISOString(),
        endTime: updatedBooking.endTime.toISOString(),
        checkedInAt: updatedBooking.checkedInAt?.toISOString(),
        emittedAt: new Date().toISOString(),
      });

      this.realtimeService.notify({
        userId: updatedBooking.student?.userId ?? userId,
        boothId: updatedBooking.boothId,
        message: fallbackActivated
          ? 'Xac thuc khuon mat that bai qua 5 lan, he thong da luu anh lan cuoi va cho phep vao thi de giang vien doi chieu truoc khi cong bo diem.'
          : 'Xác thực khuôn mặt thành công. Check-in đã được ghi nhận.',
        level: fallbackActivated ? 'warning' : 'success',
        emittedAt: new Date().toISOString(),
      });
    }

    const remainingAttempts = fallbackPolicyEnabled
      ? Math.max(0, EXAM_FALLBACK_MAX_FAILED_ATTEMPTS - updatedBooking.checkinAttemptCount)
      : null;

    return {
      bookingId: updatedBooking.id,
      matched,
      similarityScore,
      threshold,
      fallbackApplied: fallbackActivated,
      evidenceCaptured: Boolean(evidenceImageUrl),
      attemptNumber: updatedBooking.checkinAttemptCount,
      maxFailedAttemptsBeforeAllow: fallbackPolicyEnabled
        ? EXAM_FALLBACK_MAX_FAILED_ATTEMPTS
        : null,
      remainingAttempts,
      checkinStatus: updatedBooking.checkinStatus,
      bookingStatus: updatedBooking.status,
      checkedInAt: updatedBooking.checkedInAt,
    };
  }
}


