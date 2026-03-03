import {
  Controller,
  Get,
  Post,
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

@Controller('exams')
@UseGuards(AuthGuard('jwt'))
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  // ==================== EXAM CRUD ====================

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

  @Get(':id')
  findOneExam(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.findOne(id, userId, userRole);
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

  @Get('sessions/:sessionId/results')
  getSessionResults(@Param('sessionId') sessionId: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.examsService.getSessionResult(sessionId, userId, userRole);
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
}
