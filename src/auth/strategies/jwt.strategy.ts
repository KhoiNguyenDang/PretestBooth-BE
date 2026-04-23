import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'secret_key_tam_thoi',
    });
  }

  async validate(payload: any) {
    const isActivatedBoothContext = Boolean(payload?.isActivatedBoothContext);
    const boothId = payload?.boothId || null;

    if (isActivatedBoothContext) {
      if (!boothId) {
        throw new UnauthorizedException('Phiên kiosk không hợp lệ');
      }

      const booth = await this.prisma.booth.findUnique({
        where: { id: boothId },
        select: {
          id: true,
          status: true,
          sessionTokenHash: true,
        },
      });

      const allowedStatuses = new Set(['ACTIVE', 'MAINTENANCE_PENDING']);
      if (!booth || !allowedStatuses.has(booth.status) || !booth.sessionTokenHash) {
        throw new UnauthorizedException('Phiên kiosk đã hết hiệu lực');
      }
    }

    return {
      sub: payload.sub,
      role: payload.role,
      isActivatedBoothContext,
      boothAccessMode: payload?.boothAccessMode || null,
      boothId,
    };
  }
}
