import {
  Controller, Post, Get, Body, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProctoringService } from './proctoring.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { ReportProctoringEventSchema } from './dto/proctoring.dto';
import type { ReportProctoringEventDto } from './dto/proctoring.dto';

@Controller('proctoring')
@UseGuards(AuthGuard('jwt'))
export class ProctoringController {
  constructor(private readonly proctoringService: ProctoringService) {}

  @Post('event')
  @HttpCode(HttpStatus.OK)
  reportEvent(
    @Body(new ZodValidationPipe(ReportProctoringEventSchema)) dto: ReportProctoringEventDto,
    @Req() req,
  ) {
    return this.proctoringService.reportEvent(req.user['sub'], dto);
  }

  @Get('session/:sessionId')
  getSessionReport(@Param('sessionId') sessionId: string, @Req() req) {
    return this.proctoringService.getSessionReport(sessionId, req.user['role']);
  }
}
