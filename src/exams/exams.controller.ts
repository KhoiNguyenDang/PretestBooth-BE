import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExamsService } from './exams.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { CreateExamSchema } from './dto/create-exam.dto';
import type { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamSchema } from './dto/update-exam.dto';
import type { UpdateExamDto } from './dto/update-exam.dto';
import { QueryExamSchema } from './dto/query-exam.dto';
import type { QueryExamDto } from './dto/query-exam.dto';
import { SaveAnswerSchema } from './dto/save-answer.dto';
import type { SaveAnswerDto } from './dto/save-answer.dto';
import { GradeSessionSchema } from './dto/grade-session.dto';
import type { GradeSessionDto } from './dto/grade-session.dto';
import { QueryExamSessionsSchema } from './dto/query-exam-sessions.dto';
import type { QueryExamSessionsDto } from './dto/query-exam-sessions.dto';
import {
  AbortExamSessionSchema,
  ExtendExamSessionSchema,
  ForceSubmitExamSessionSchema,
} from './dto/monitor-session.dto';
import type {
  AbortExamSessionDto,
  ExtendExamSessionDto,
  ForceSubmitExamSessionDto,
} from './dto/monitor-session.dto';
import {
  UpsertPretestConfigSchema,
} from './dto/pretest-config.dto';
import type { UpsertPretestConfigDto } from './dto/pretest-config.dto';

@Controller('exams')
@UseGuards(AuthGuard('jwt'))
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ==================== EXAM CRUD ====================

  @Post('create-random')
  createRandomExam(
    @Body(new ZodValidationPipe(CreateExamSchema)) dto: CreateExamDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.createRandom(userId, userRole, dto);
  }

  @Post('create-manual')
  createManualExam(
    @Body(new ZodValidationPipe(CreateExamSchema)) dto: CreateExamDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.createManual(userId, userRole, dto);
  }

  @Post()
  createExam(@Body(new ZodValidationPipe(CreateExamSchema)) dto: CreateExamDto, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.create(userId, userRole, dto);
  }

  @Get()
  findAllExams(@Query(new ZodValidationPipe(QueryExamSchema)) query: QueryExamDto, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.findAll(query, userId, userRole);
  }

  @Patch(':id')
  updateExam(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateExamSchema)) dto: UpdateExamDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.update(id, dto, userId, userRole);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  removeExam(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.remove(id, userId, userRole);
  }

  // ==================== EXAM SESSION ====================

  @Post(':id/start')
  startSession(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    return this.examsService.startSession(id, userId);
  }

  @Get('sessions')
  listSessions(
    @Query(new ZodValidationPipe(QueryExamSessionsSchema)) query: QueryExamSessionsDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.findAllSessions(userId, userRole, query);
  }

  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string, @Req() req) {
    const userId = req.user['sub'];
    return this.examsService.getSessionData(sessionId, userId);
  }

  @Post('sessions/:sessionId/answers')
  saveAnswer(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(SaveAnswerSchema)) dto: SaveAnswerDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    return this.examsService.saveAnswer(sessionId, userId, dto);
  }

  @Post('sessions/:sessionId/submit')
  submitSession(@Param('sessionId') sessionId: string, @Req() req) {
    const userId = req.user['sub'];
    return this.examsService.submitSession(sessionId, userId);
  }

  @Post('sessions/:sessionId/auto-submit')
  @HttpCode(HttpStatus.OK)
  autoSubmitSession(@Param('sessionId') sessionId: string, @Req() req) {
    const userId = req.user['sub'];
    // Same implementation as submitSession but called automatically when time expires
    return this.examsService.submitSession(sessionId, userId);
  }

  @Get('sessions/:sessionId/results')
  getSessionResults(@Param('sessionId') sessionId: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.getSessionResult(sessionId, userId, userRole);
  }

  @Get('pretest/config')
  getPretestConfig(@Req() req) {
    return this.examsService.getPretestConfig(req.user['sub'], req.user['role']);
  }

  @Put('pretest/config')
  upsertPretestConfig(
    @Body(new ZodValidationPipe(UpsertPretestConfigSchema)) dto: UpsertPretestConfigDto,
    @Req() req,
  ) {
    return this.examsService.upsertPretestConfig(req.user['sub'], req.user['role'], dto);
  }

  @Get('pretest/status')
  getPretestStatus(@Req() req) {
    return this.examsService.getMyPretestStatus(req.user['sub'], req.user['role']);
  }

  @Post('pretest/session/start')
  startPretestSession(@Req() req) {
    return this.examsService.startAutoPretestSession(req.user['sub']);
  }

  @Patch('sessions/:sessionId/grade')
  gradeSession(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(GradeSessionSchema)) dto: GradeSessionDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.gradeSession(sessionId, dto, userId, userRole);
  }

  @Post('sessions/:sessionId/force-submit')
  @HttpCode(HttpStatus.OK)
  forceSubmitSession(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(ForceSubmitExamSessionSchema)) dto: ForceSubmitExamSessionDto,
    @Req() req,
  ) {
    return this.examsService.forceSubmitSessionByMonitor(
      sessionId,
      dto.reason,
      req.user['sub'],
      req.user['role'],
    );
  }

  @Post('sessions/:sessionId/abort')
  @HttpCode(HttpStatus.OK)
  abortSession(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(AbortExamSessionSchema)) dto: AbortExamSessionDto,
    @Req() req,
  ) {
    return this.examsService.abortSessionByMonitor(
      sessionId,
      dto.reason,
      req.user['sub'],
      req.user['role'],
    );
  }

  @Post('sessions/:sessionId/extend')
  @HttpCode(HttpStatus.OK)
  extendSession(
    @Param('sessionId') sessionId: string,
    @Body(new ZodValidationPipe(ExtendExamSessionSchema)) dto: ExtendExamSessionDto,
    @Req() req,
  ) {
    return this.examsService.extendSessionByMonitor(
      sessionId,
      dto.minutes,
      dto.reason,
      req.user['sub'],
      req.user['role'],
    );
  }

  @Get(':id')
  findOneExam(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.findOne(id, userId, userRole);
  }
}
