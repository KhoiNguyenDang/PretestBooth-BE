import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  CheckinVerifySchema,
  type CheckinVerifyDto,
} from './dto/checkin-verify.dto';
import {
  UpdateCheckinThresholdSchema,
  type UpdateCheckinThresholdDto,
} from './dto/checkin-threshold.dto';
import { CheckinService } from './checkin.service';

@Controller('checkin')
@UseGuards(AuthGuard('jwt'))
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Get('threshold')
  getThreshold() {
    return this.checkinService.getCheckinThresholdConfig();
  }

  @Patch('threshold')
  updateThreshold(
    @Req() req,
    @Body(new ZodValidationPipe(UpdateCheckinThresholdSchema)) dto: UpdateCheckinThresholdDto,
  ) {
    return this.checkinService.updateCheckinThreshold(req.user['role'], req.user['sub'], dto.threshold);
  }

  @Post('verify')
  verify(
    @Req() req,
    @Body(new ZodValidationPipe(CheckinVerifySchema)) dto: CheckinVerifyDto,
  ) {
    return this.checkinService.verify(req.user['sub'], req.user['role'], dto);
  }
}
