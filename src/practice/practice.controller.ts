import {
  Controller, Get, Post, Param, Body, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PracticeService } from './practice.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  AbortPracticeSessionSchema,
  CreatePracticeSessionSchema,
  ExtendPracticeSessionSchema,
  SubmitPracticeAnswerSchema,
} from './dto/practice.dto';
import type {
  AbortPracticeSessionDto,
  CreatePracticeSessionDto,
  ExtendPracticeSessionDto,
  SubmitPracticeAnswerDto,
} from './dto/practice.dto';

@Controller('practice')
@UseGuards(AuthGuard('jwt'))
export class PracticeController {
  constructor(private readonly practiceService: PracticeService) {}

  @Post()
  createSession(
    @Body(new ZodValidationPipe(CreatePracticeSessionSchema)) dto: CreatePracticeSessionDto,
    @Req() req,
  ) {
    return this.practiceService.createSession(req.user['sub'], dto);
  }

  @Get(':id')
  getSession(@Param('id') id: string, @Req() req) {
    return this.practiceService.getSession(id, req.user['sub']);
  }

  @Post(':id/answers')
  @HttpCode(HttpStatus.OK)
  submitAnswer(
    @Param('id') sessionId: string,
    @Body(new ZodValidationPipe(SubmitPracticeAnswerSchema)) dto: SubmitPracticeAnswerDto,
    @Req() req,
  ) {
    return this.practiceService.submitAnswer(sessionId, req.user['sub'], dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  completeSession(@Param('id') id: string, @Req() req) {
    return this.practiceService.completeSession(id, req.user['sub']);
  }

  @Post(':id/monitor/extend')
  @HttpCode(HttpStatus.OK)
  extendSessionByMonitor(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ExtendPracticeSessionSchema)) dto: ExtendPracticeSessionDto,
    @Req() req,
  ) {
    return this.practiceService.extendSessionByMonitor(
      id,
      dto.minutes,
      dto.reason,
      req.user['sub'],
      req.user['role'],
    );
  }

  @Post(':id/monitor/abort')
  @HttpCode(HttpStatus.OK)
  abortSessionByMonitor(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AbortPracticeSessionSchema)) dto: AbortPracticeSessionDto,
    @Req() req,
  ) {
    return this.practiceService.abortSessionByMonitor(id, dto.reason, req.user['sub'], req.user['role']);
  }
}
