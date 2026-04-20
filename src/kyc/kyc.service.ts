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
import type { KycRegisterDto } from './dto/kyc-register.dto';

const KYC_CARD_THRESHOLD_SETTING_KEY = 'KYC_CARD_FACE_SIMILARITY_THRESHOLD';
const DEFAULT_KYC_CARD_THRESHOLD = 0.75;
const MIN_KYC_CARD_THRESHOLD = 0.5;
const MAX_KYC_CARD_THRESHOLD = 0.99;

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  private ensureAdmin(userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chỉ quản trị viên mới có thể cập nhật ngưỡng xác thực thẻ sinh viên');
    }
  }

  private parseThreshold(rawValue: string | null | undefined): number | null {
    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return null;
    }

    if (value < MIN_KYC_CARD_THRESHOLD || value > MAX_KYC_CARD_THRESHOLD) {
      return null;
    }

    return value;
  }

  async getKycCardThresholdConfig() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: KYC_CARD_THRESHOLD_SETTING_KEY },
    });

    const thresholdFromDb = this.parseThreshold(setting?.value);
    if (thresholdFromDb !== null) {
      return {
        key: KYC_CARD_THRESHOLD_SETTING_KEY,
        threshold: thresholdFromDb,
        source: 'database' as const,
        updatedAt: setting?.updatedAt ?? null,
      };
    }

    const thresholdFromEnv = this.parseThreshold(process.env.KYC_CARD_FACE_SIMILARITY_THRESHOLD);
    if (thresholdFromEnv !== null) {
      return {
        key: KYC_CARD_THRESHOLD_SETTING_KEY,
        threshold: thresholdFromEnv,
        source: 'env' as const,
        updatedAt: setting?.updatedAt ?? null,
      };
    }

    return {
      key: KYC_CARD_THRESHOLD_SETTING_KEY,
      threshold: DEFAULT_KYC_CARD_THRESHOLD,
      source: 'default' as const,
      updatedAt: setting?.updatedAt ?? null,
    };
  }

  async updateKycCardThreshold(userRole: string, userId: string, threshold: number) {
    this.ensureAdmin(userRole);

    if (!Number.isFinite(threshold)) {
      throw new BadRequestException('Ngưỡng xác thực thẻ sinh viên không hợp lệ');
    }

    if (threshold < MIN_KYC_CARD_THRESHOLD || threshold > MAX_KYC_CARD_THRESHOLD) {
      throw new BadRequestException(
        `Ngưỡng xác thực thẻ sinh viên phải nằm trong khoảng ${MIN_KYC_CARD_THRESHOLD} - ${MAX_KYC_CARD_THRESHOLD}`,
      );
    }

    const normalizedThreshold = Number(threshold.toFixed(2));
    const savedSetting = await this.prisma.systemSetting.upsert({
      where: { key: KYC_CARD_THRESHOLD_SETTING_KEY },
      update: {
        value: String(normalizedThreshold),
        updatedByUserId: userId,
      },
      create: {
        key: KYC_CARD_THRESHOLD_SETTING_KEY,
        value: String(normalizedThreshold),
        description: 'Card-to-live face similarity threshold for KYC verification',
        updatedByUserId: userId,
      },
    });

    return {
      key: KYC_CARD_THRESHOLD_SETTING_KEY,
      threshold: normalizedThreshold,
      source: 'database' as const,
      updatedAt: savedSetting.updatedAt,
      updatedByUserId: savedSetting.updatedByUserId,
    };
  }

  async register(userId: string, dto: KycRegisterDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, kycStatus: true },
    });

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const [embeddingResult, studentCardEmbeddingResult, cardThresholdConfig] = await Promise.all([
      this.faceRecognitionService.extractEmbedding(dto.image),
      this.faceRecognitionService.extractEmbedding(dto.studentCardImage),
      this.getKycCardThresholdConfig(),
    ]);

    const cardFaceMatchScore = this.faceRecognitionService.cosineSimilarity(
      studentCardEmbeddingResult.embedding,
      embeddingResult.embedding,
    );

    const cardImageUrl = await this.cloudinaryService.uploadKycStudentCardImage(dto.studentCardImage);
    const now = new Date();

    if (cardFaceMatchScore < cardThresholdConfig.threshold) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: 'REJECTED',
          kycLastAttemptAt: now,
          studentCardImageUrl: cardImageUrl,
          studentCardFaceMatchScore: cardFaceMatchScore,
        },
      });

      throw new BadRequestException(
        `Anh the sinh vien khong khop voi khuon mat (similarity=${cardFaceMatchScore.toFixed(4)}, threshold=${cardThresholdConfig.threshold.toFixed(2)}).`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'VERIFIED',
        kycRegisteredAt: now,
        kycVerifiedAt: now,
        kycLastAttemptAt: now,
        kycConsentVersion: dto.consentVersion,
        kycConsentedAt: now,
        studentCardImageUrl: cardImageUrl,
        studentCardVerifiedAt: now,
        studentCardFaceMatchScore: cardFaceMatchScore,
        faceEmbedding: embeddingResult.embedding as Prisma.InputJsonValue,
        faceEmbeddingModel: embeddingResult.model,
        faceEmbeddingVersion: embeddingResult.version,
        faceEmbeddingNorm: embeddingResult.norm,
        faceEmbeddingUpdatedAt: now,
      },
    });

    return {
      userId,
      kycStatus: 'VERIFIED',
      embeddingDimension: embeddingResult.embedding.length,
      embeddingModel: embeddingResult.model,
      embeddingVersion: embeddingResult.version,
      verifiedAt: now.toISOString(),
      cardVerified: true,
      cardFaceMatchScore,
      cardThreshold: cardThresholdConfig.threshold,
      studentCardImageUrl: cardImageUrl,
    };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        kycStatus: true,
        kycRegisteredAt: true,
        kycVerifiedAt: true,
        kycLastAttemptAt: true,
        faceEmbeddingUpdatedAt: true,
        faceEmbedding: true,
        studentCardVerifiedAt: true,
        studentCardFaceMatchScore: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const hasEmbedding =
      Array.isArray(user.faceEmbedding) && user.faceEmbedding.length > 0;

    return {
      kycStatus: user.kycStatus,
      hasEmbedding,
      kycRegisteredAt: user.kycRegisteredAt,
      kycVerifiedAt: user.kycVerifiedAt,
      kycLastAttemptAt: user.kycLastAttemptAt,
      faceEmbeddingUpdatedAt: user.faceEmbeddingUpdatedAt,
      cardVerified: Boolean(user.studentCardVerifiedAt),
      cardFaceMatchScore: user.studentCardFaceMatchScore,
    };
  }
}
