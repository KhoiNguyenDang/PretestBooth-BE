import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  GenerateReviewSessionsSchema,
  type GenerateReviewSessionsDto,
} from './dto/generate-review-sessions.dto';
import {
  QueryReviewSessionsSchema,
  type QueryReviewSessionsDto,
} from './dto/query-review-sessions.dto';
import {
  ResubmitQuestionReviewSchema,
  type ResubmitQuestionReviewDto,
} from './dto/resubmit-question-review.dto';
import {
  SubmitQuestionReviewSchema,
  type SubmitQuestionReviewDto,
} from './dto/submit-question-review.dto';
import { QuestionReviewService } from './question-review.service';

@Controller('questions/review')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('LECTURER', 'ADMIN')
export class QuestionReviewController {
  constructor(private readonly questionReviewService: QuestionReviewService) {}

  @Get('sessions')
  getSessions(
    @Query(new ZodValidationPipe(QueryReviewSessionsSchema)) query: QueryReviewSessionsDto,
  ) {
    return this.questionReviewService.getReviewSessions(query);
  }

  @Get('stats')
  getStats(@Query(new ZodValidationPipe(QueryReviewSessionsSchema)) query: QueryReviewSessionsDto) {
    return this.questionReviewService.getReviewStats(query.quarter, query.year);
  }

  @Post('submit')
  submitReview(
    @Body(new ZodValidationPipe(SubmitQuestionReviewSchema)) dto: SubmitQuestionReviewDto,
    @Req() req,
  ) {
    return this.questionReviewService.submitReview(dto, req.user['sub'], req.user['role']);
  }

  @Post('resubmit')
  resubmitForReview(
    @Body(new ZodValidationPipe(ResubmitQuestionReviewSchema)) dto: ResubmitQuestionReviewDto,
    @Req() req,
  ) {
    return this.questionReviewService.resubmitForReview(dto, req.user['sub'], req.user['role']);
  }

  @Post('sessions/generate')
  @Roles('ADMIN')
  generateSessions(
    @Body(new ZodValidationPipe(GenerateReviewSessionsSchema)) dto: GenerateReviewSessionsDto,
  ) {
    return this.questionReviewService.createQuarterlySessions(dto);
  }
}
