import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  KycRegisterSchema,
  type KycRegisterDto,
} from './dto/kyc-register.dto';
import {
  UpdateKycCardThresholdSchema,
  type UpdateKycCardThresholdDto,
} from './dto/kyc-card-threshold.dto';
import { KycService } from './kyc.service';

@Controller('kyc')
@UseGuards(AuthGuard('jwt'))
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('register')
  register(
    @Req() req,
    @Body(new ZodValidationPipe(KycRegisterSchema)) dto: KycRegisterDto,
  ) {
    return this.kycService.register(req.user['sub'], dto);
  }

  @Get('status')
  status(@Req() req) {
    return this.kycService.getStatus(req.user['sub']);
  }

  @Get('card-threshold')
  getCardThreshold() {
    return this.kycService.getKycCardThresholdConfig();
  }

  @Post('card-threshold')
  updateCardThreshold(
    @Req() req,
    @Body(new ZodValidationPipe(UpdateKycCardThresholdSchema)) dto: UpdateKycCardThresholdDto,
  ) {
    return this.kycService.updateKycCardThreshold(req.user['role'], req.user['sub'], dto.threshold);
  }
}
