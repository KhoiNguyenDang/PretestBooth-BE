import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FaceRecognitionService } from '../face/face-recognition.service';
import { PrismaService } from '../prisma/prisma.service';
import type { KycRegisterDto } from './dto/kyc-register.dto';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faceRecognitionService: FaceRecognitionService,
  ) {}

  async register(userId: string, dto: KycRegisterDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, kycStatus: true },
    });

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    if (!dto.liveness.passed) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: 'REJECTED',
          kycLastAttemptAt: new Date(),
        },
      });
      throw new BadRequestException('Liveness không đạt. Vui lòng thử lại.');
    }

    const embeddingResult = await this.faceRecognitionService.extractEmbedding(dto.image);
    const now = new Date();

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycStatus: 'VERIFIED',
        kycRegisteredAt: now,
        kycVerifiedAt: now,
        kycLastAttemptAt: now,
        kycConsentVersion: dto.consentVersion,
        kycConsentedAt: now,
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
    };
  }
}
