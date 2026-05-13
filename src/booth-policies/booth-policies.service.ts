import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BoothPolicyInputSchema,
  type BoothPolicyConfigDto,
  type UpdateBoothPolicyDto,
} from './dto/booth-policy.dto';

const BOOTH_POLICY_SETTING_KEY = 'BOOTH_POLICY_CONFIG';

const DEFAULT_BOOTH_POLICY_CONFIG: BoothPolicyConfigDto = {
  bookingMinDaysInAdvance: 7,
  bookingMaxDaysInAdvance: 30,
  bookingCancellationCutoffHours: 12,
  walkInPracticeEnabled: true,
  warnBeforeNextExamMinutes: 15,
  forceLogoutBeforeNextExamMinutes: 5,
  noShowGraceMinutes: 15,
  enableExamFallbackAfterFailures: false,
  maxFailedAttemptsBeforeAllow: 3,
};

@Injectable()
export class BoothPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveLecturerIdByUserId(userId: string): Promise<string | null> {
    const lecturer = await this.prisma.lecturer.findUnique({
      where: { userId },
      select: { id: true },
    });
    return lecturer?.id ?? null;
  }

  private ensureAdmin(userRole: string) {
    if (userRole !== 'ADMIN') {
      throw new ForbiddenException('Chi quan tri vien moi duoc cap nhat cau hinh booth policy');
    }
  }

  private validatePolicyConsistency(config: BoothPolicyConfigDto) {
    if (config.bookingMaxDaysInAdvance < config.bookingMinDaysInAdvance) {
      throw new BadRequestException(
        'bookingMaxDaysInAdvance phai lon hon hoac bang bookingMinDaysInAdvance',
      );
    }

    if (config.warnBeforeNextExamMinutes <= config.forceLogoutBeforeNextExamMinutes) {
      throw new BadRequestException(
        'warnBeforeNextExamMinutes phai lon hon forceLogoutBeforeNextExamMinutes',
      );
    }

    if (!config.enableExamFallbackAfterFailures && config.maxFailedAttemptsBeforeAllow < 1) {
      throw new BadRequestException('maxFailedAttemptsBeforeAllow phai lon hon hoac bang 1');
    }
  }

  private parsePolicyValue(rawValue: string | null | undefined): BoothPolicyConfigDto | null {
    if (!rawValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawValue);
      const validated = BoothPolicyInputSchema.partial().safeParse(parsed);
      if (!validated.success) {
        return null;
      }

      return this.mergeWithDefault(validated.data);
    } catch {
      return null;
    }
  }

  private mergeWithDefault(partial?: Partial<BoothPolicyConfigDto> | null): BoothPolicyConfigDto {
    const merged = {
      ...DEFAULT_BOOTH_POLICY_CONFIG,
      ...(partial || {}),
    };

    const validated = BoothPolicyInputSchema.parse(merged);
    this.validatePolicyConsistency(validated);
    return validated;
  }

  async getConfig(): Promise<BoothPolicyConfigDto> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: BOOTH_POLICY_SETTING_KEY },
    });

    const parsed = this.parsePolicyValue(setting?.value);
    if (parsed) {
      return parsed;
    }

    return { ...DEFAULT_BOOTH_POLICY_CONFIG };
  }

  async getBoothPolicyConfig() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: BOOTH_POLICY_SETTING_KEY },
    });

    const parsed = this.parsePolicyValue(setting?.value);
    if (parsed) {
      return {
        key: BOOTH_POLICY_SETTING_KEY,
        config: parsed,
        source: 'database' as const,
        updatedAt: setting?.updatedAt ?? null,
      };
    }

    return {
      key: BOOTH_POLICY_SETTING_KEY,
      config: { ...DEFAULT_BOOTH_POLICY_CONFIG },
      source: 'default' as const,
      updatedAt: setting?.updatedAt ?? null,
    };
  }

  async updateBoothPolicyConfig(userRole: string, userId: string, dto: UpdateBoothPolicyDto) {
    this.ensureAdmin(userRole);
    const actorLecturerId = await this.resolveLecturerIdByUserId(userId);

    const current = await this.getConfig();
    const next = this.mergeWithDefault({
      ...current,
      ...dto,
    });

    const savedSetting = await this.prisma.systemSetting.upsert({
      where: { key: BOOTH_POLICY_SETTING_KEY },
      update: {
        value: JSON.stringify(next),
        updatedByLecturerId: actorLecturerId,
      },
      create: {
        key: BOOTH_POLICY_SETTING_KEY,
        value: JSON.stringify(next),
        description: 'Global booth booking and kiosk walk-in policy',
        updatedByLecturerId: actorLecturerId,
      },
    });

    return {
      key: BOOTH_POLICY_SETTING_KEY,
      config: next,
      source: 'database' as const,
      updatedAt: savedSetting.updatedAt,
      updatedByLecturerId: savedSetting.updatedByLecturerId,
    };
  }
}

