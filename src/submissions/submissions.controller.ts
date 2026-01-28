import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubmissionsService } from './submissions.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { CreateSubmissionSchema, QuerySubmissionsSchema } from './dto/submission.dto';
import type { CreateSubmissionDto, QuerySubmissionsDto } from './dto/submission.dto';

@Controller('submissions')
@UseGuards(AuthGuard('jwt'))
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  /**
   * Submit code for a problem
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(CreateSubmissionSchema)) dto: CreateSubmissionDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    return this.submissionsService.create(userId, dto);
  }

  /**
   * Get all submissions (with pagination and filters)
   */
  @Get()
  async findAll(
    @Query(new ZodValidationPipe(QuerySubmissionsSchema)) query: QuerySubmissionsDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.submissionsService.findAll(userId, userRole, query);
  }

  /**
   * Get user's submissions for a specific problem
   */
  @Get('problem/:problemId')
  async findByProblem(
    @Param('problemId') problemId: string,
    @Query(new ZodValidationPipe(QuerySubmissionsSchema)) query: QuerySubmissionsDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.submissionsService.findByProblem(problemId, userId, userRole, query);
  }

  /**
   * Get submission statistics for a problem
   */
  @Get('problem/:problemId/stats')
  async getStats(@Param('problemId') problemId: string, @Req() req) {
    const userId = req.user['sub'];
    return this.submissionsService.getStats(problemId, userId);
  }

  /**
   * Get a single submission by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.submissionsService.findOne(id, userId, userRole);
  }
}
