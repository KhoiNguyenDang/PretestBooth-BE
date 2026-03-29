import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  CheckinVerifySchema,
  type CheckinVerifyDto,
} from './dto/checkin-verify.dto';
import { CheckinService } from './checkin.service';

@Controller('checkin')
@UseGuards(AuthGuard('jwt'))
export class CheckinController {
  constructor(private readonly checkinService: CheckinService) {}

  @Post('verify')
  verify(
    @Req() req,
    @Body(new ZodValidationPipe(CheckinVerifySchema)) dto: CheckinVerifyDto,
  ) {
    return this.checkinService.verify(req.user['sub'], req.user['role'], dto);
  }
}
