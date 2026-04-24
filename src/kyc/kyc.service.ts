import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { CloudinaryService } from '../common/cloudinary/cloudinary.service';
import { FaceRecognitionService } from '../face/face-recognition.service';
import { PrismaService } from '../prisma/prisma.service';
import type { KycRegisterDto } from './dto/kyc-register.dto';
import type {
  ApproveKycManualReviewDto,
  CancelVerifiedKycDto,
  QueryVerifiedKycDto,
  QueryKycManualReviewDto,
  RejectKycManualReviewDto,
  RequestKycManualReviewDto,
} from './dto/kyc-manual-review.dto';

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
    private readonly authorizationService: AuthorizationService,
  ) {}

  private ensureAdmin(userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException(
        'Chỉ quản trị viên mới có thể cập nhật ngưỡng xác thực thẻ sinh viên',
      );
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

  private async assertKycReviewerAccess(userId: string, userRole: string) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (userRole !== 'LECTURER') {
      throw new ForbiddenException(
        'Chỉ giảng viên hoặc quản trị viên mới có thể duyệt KYC thủ công',
      );
    }

    await this.authorizationService.assertPermission(
      userId,
      userRole,
      'APPROVE_KYC',
      'Giảng viên chưa được cấp quyền duyệt KYC thủ công',
    );
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

    const [cardImageUrl, faceImageUrl] = await Promise.all([
      this.cloudinaryService.uploadKycStudentCardImage(dto.studentCardImage),
      this.cloudinaryService.uploadKycFaceImage(dto.image),
    ]);
    const now = new Date();

    if (cardFaceMatchScore < cardThresholdConfig.threshold) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          kycStatus: 'REJECTED',
          kycLastAttemptAt: now,
          kycFaceImageUrl: faceImageUrl,
          kycManualReviewStatus: 'NOT_REQUESTED',
          kycManualReviewRequestedAt: null,
          kycManualReviewRequestedReason: null,
          kycManualReviewReviewedAt: null,
          kycManualReviewedByUserId: null,
          kycManualReviewRejectionReason: null,
          kycManualReviewNotes: null,
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
        kycFaceImageUrl: faceImageUrl,
        kycManualReviewStatus: 'NOT_REQUESTED',
        kycManualReviewRequestedAt: null,
        kycManualReviewRequestedReason: null,
        kycManualReviewReviewedAt: null,
        kycManualReviewedByUserId: null,
        kycManualReviewRejectionReason: null,
        kycManualReviewNotes: null,
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
      faceImageUrl,
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
        kycManualReviewStatus: true,
        kycManualReviewRequestedAt: true,
        kycManualReviewReviewedAt: true,
        kycManualReviewRejectionReason: true,
        kycManualReviewNotes: true,
        studentCardVerifiedAt: true,
        studentCardFaceMatchScore: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const hasEmbedding = Array.isArray(user.faceEmbedding) && user.faceEmbedding.length > 0;

    return {
      kycStatus: user.kycStatus,
      hasEmbedding,
      kycRegisteredAt: user.kycRegisteredAt,
      kycVerifiedAt: user.kycVerifiedAt,
      kycLastAttemptAt: user.kycLastAttemptAt,
      faceEmbeddingUpdatedAt: user.faceEmbeddingUpdatedAt,
      kycManualReviewStatus: user.kycManualReviewStatus,
      kycManualReviewRequestedAt: user.kycManualReviewRequestedAt,
      kycManualReviewReviewedAt: user.kycManualReviewReviewedAt,
      kycManualReviewRejectionReason: user.kycManualReviewRejectionReason,
      kycManualReviewNotes: user.kycManualReviewNotes,
      cardVerified: Boolean(user.studentCardVerifiedAt),
      cardFaceMatchScore: user.studentCardFaceMatchScore,
    };
  }

  async requestManualReview(userId: string, userRole: string, dto: RequestKycManualReviewDto) {
    if (userRole !== 'STUDENT') {
      throw new ForbiddenException('Chỉ sinh viên mới có thể yêu cầu duyệt KYC thủ công');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        kycStatus: true,
        kycManualReviewStatus: true,
        studentCardImageUrl: true,
        kycFaceImageUrl: true,
      },
    });

    if (!user || user.role !== 'STUDENT') {
      throw new NotFoundException('Không tìm thấy hồ sơ sinh viên cần yêu cầu duyệt');
    }

    if (!user.studentCardImageUrl || !user.kycFaceImageUrl) {
      throw new BadRequestException('Thiếu dữ liệu ảnh KYC để gửi yêu cầu duyệt thủ công');
    }

    if (user.kycStatus === 'VERIFIED') {
      throw new BadRequestException(
        'Bạn đã xác thực KYC thành công, không cần gửi yêu cầu duyệt thủ công',
      );
    }

    if (user.kycStatus !== 'REJECTED') {
      throw new BadRequestException('Chỉ hồ sơ KYC bị từ chối mới có thể yêu cầu duyệt thủ công');
    }

    if (user.kycManualReviewStatus === 'PENDING') {
      throw new ConflictException('Yêu cầu duyệt thủ công đang chờ xử lý');
    }

    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycManualReviewStatus: 'PENDING',
        kycManualReviewRequestedAt: now,
        kycManualReviewRequestedReason: dto.reason?.trim() || null,
        kycManualReviewReviewedAt: null,
        kycManualReviewedByUserId: null,
        kycManualReviewRejectionReason: null,
        kycManualReviewNotes: null,
      },
      select: {
        kycStatus: true,
        kycManualReviewStatus: true,
        kycManualReviewRequestedAt: true,
      },
    });

    return {
      kycStatus: updated.kycStatus,
      kycManualReviewStatus: updated.kycManualReviewStatus,
      requestedAt: updated.kycManualReviewRequestedAt,
      message: 'Đã gửi yêu cầu duyệt KYC thủ công thành công',
    };
  }

  async getPendingManualReviews(
    reviewerId: string,
    reviewerRole: string,
    query: QueryKycManualReviewDto,
  ) {
    await this.assertKycReviewerAccess(reviewerId, reviewerRole);

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      kycManualReviewStatus: 'PENDING',
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { studentCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          kycManualReviewRequestedAt: query.sortOrder,
        },
        select: {
          id: true,
          email: true,
          name: true,
          studentCode: true,
          className: true,
          kycStatus: true,
          kycLastAttemptAt: true,
          kycFaceImageUrl: true,
          studentCardImageUrl: true,
          studentCardFaceMatchScore: true,
          kycManualReviewStatus: true,
          kycManualReviewRequestedAt: true,
          kycManualReviewRequestedReason: true,
        },
      }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getVerifiedStudents(
    reviewerId: string,
    reviewerRole: string,
    query: QueryVerifiedKycDto,
  ) {
    await this.assertKycReviewerAccess(reviewerId, reviewerRole);

    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const search = query.search?.trim();

    const where: Prisma.UserWhereInput = {
      role: 'STUDENT',
      kycStatus: 'VERIFIED',
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { studentCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          {
            kycVerifiedAt: query.sortOrder,
          },
          {
            createdAt: 'desc',
          },
        ],
        select: {
          id: true,
          email: true,
          name: true,
          studentCode: true,
          className: true,
          kycStatus: true,
          kycVerifiedAt: true,
          kycLastAttemptAt: true,
          kycManualReviewStatus: true,
          studentCardFaceMatchScore: true,
          studentCardVerifiedAt: true,
          faceEmbeddingUpdatedAt: true,
        },
      }),
    ]);

    return {
      data,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getManualReviewDetail(reviewerId: string, reviewerRole: string, studentId: string) {
    await this.assertKycReviewerAccess(reviewerId, reviewerRole);

    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
      },
      select: {
        id: true,
        email: true,
        name: true,
        studentCode: true,
        className: true,
        kycStatus: true,
        kycLastAttemptAt: true,
        kycRegisteredAt: true,
        kycVerifiedAt: true,
        kycFaceImageUrl: true,
        studentCardImageUrl: true,
        studentCardFaceMatchScore: true,
        kycManualReviewStatus: true,
        kycManualReviewRequestedAt: true,
        kycManualReviewRequestedReason: true,
        kycManualReviewReviewedAt: true,
        kycManualReviewedByUserId: true,
        kycManualReviewRejectionReason: true,
        kycManualReviewNotes: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Không tìm thấy hồ sơ sinh viên cần duyệt KYC');
    }

    return student;
  }

  async approveManualReview(
    reviewerId: string,
    reviewerRole: string,
    studentId: string,
    dto: ApproveKycManualReviewDto,
  ) {
    await this.assertKycReviewerAccess(reviewerId, reviewerRole);

    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
      },
      select: {
        id: true,
        kycManualReviewStatus: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Không tìm thấy hồ sơ sinh viên cần duyệt KYC');
    }

    if (student.kycManualReviewStatus !== 'PENDING') {
      throw new ConflictException('Hồ sơ này không còn ở trạng thái chờ duyệt');
    }

    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: student.id },
      data: {
        kycStatus: 'VERIFIED',
        kycVerifiedAt: now,
        studentCardVerifiedAt: now,
        kycManualReviewStatus: 'APPROVED',
        kycManualReviewReviewedAt: now,
        kycManualReviewedByUserId: reviewerId,
        kycManualReviewRejectionReason: null,
        kycManualReviewNotes: dto.notes?.trim() || null,
      },
      select: {
        id: true,
        kycStatus: true,
        kycVerifiedAt: true,
        kycManualReviewStatus: true,
        kycManualReviewReviewedAt: true,
        kycManualReviewedByUserId: true,
      },
    });

    return {
      message: 'Duyệt KYC thủ công thành công',
      ...updated,
    };
  }

  async rejectManualReview(
    reviewerId: string,
    reviewerRole: string,
    studentId: string,
    dto: RejectKycManualReviewDto,
  ) {
    await this.assertKycReviewerAccess(reviewerId, reviewerRole);

    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
      },
      select: {
        id: true,
        kycManualReviewStatus: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Không tìm thấy hồ sơ sinh viên cần duyệt KYC');
    }

    if (student.kycManualReviewStatus !== 'PENDING') {
      throw new ConflictException('Hồ sơ này không còn ở trạng thái chờ duyệt');
    }

    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: student.id },
      data: {
        kycStatus: 'REJECTED',
        kycManualReviewStatus: 'REJECTED',
        kycManualReviewReviewedAt: now,
        kycManualReviewedByUserId: reviewerId,
        kycManualReviewRejectionReason: dto.reason.trim(),
        kycManualReviewNotes: dto.notes?.trim() || null,
      },
      select: {
        id: true,
        kycStatus: true,
        kycManualReviewStatus: true,
        kycManualReviewReviewedAt: true,
        kycManualReviewedByUserId: true,
        kycManualReviewRejectionReason: true,
      },
    });

    return {
      message: 'Từ chối KYC thủ công thành công',
      ...updated,
    };
  }

  async cancelVerifiedStatus(
    reviewerId: string,
    reviewerRole: string,
    studentId: string,
    dto: CancelVerifiedKycDto,
  ) {
    await this.assertKycReviewerAccess(reviewerId, reviewerRole);

    const student = await this.prisma.user.findFirst({
      where: {
        id: studentId,
        role: 'STUDENT',
      },
      select: {
        id: true,
        kycStatus: true,
      },
    });

    if (!student) {
      throw new NotFoundException('Không tìm thấy hồ sơ sinh viên cần cập nhật KYC');
    }

    if (student.kycStatus !== 'VERIFIED') {
      throw new ConflictException('Chỉ có thể hủy xác thực đối với hồ sơ đang ở trạng thái VERIFIED');
    }

    const updated = await this.prisma.user.update({
      where: { id: student.id },
      data: {
        kycStatus: 'REJECTED',
        kycVerifiedAt: null,
        studentCardVerifiedAt: null,
        kycManualReviewStatus: 'NOT_REQUESTED',
        kycManualReviewRequestedAt: null,
        kycManualReviewRequestedReason: null,
        kycManualReviewReviewedAt: new Date(),
        kycManualReviewedByUserId: reviewerId,
        kycManualReviewRejectionReason: dto.reason.trim(),
      },
      select: {
        id: true,
        kycStatus: true,
        kycManualReviewStatus: true,
        kycManualReviewReviewedAt: true,
        kycManualReviewedByUserId: true,
        kycManualReviewRejectionReason: true,
      },
    });

    return {
      message: 'Đã hủy trạng thái đã xác thực KYC của sinh viên',
      ...updated,
    };
  }
}
