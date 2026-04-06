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
import { QueryUnifiedSubmissionsSchema } from './dto/unified-submission.dto';
import type { QueryUnifiedSubmissionsDto } from './dto/unified-submission.dto';
import {
  QuerySubmissionTestGroupsSchema,
  QuerySubmissionTestMembersSchema,
} from './dto/test-submission.dto';
import type {
  QuerySubmissionTestGroupsDto,
  QuerySubmissionTestMembersDto,
} from './dto/test-submission.dto';

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
   * Get unified list of both coding submissions and exam sessions
   */
  @Get('all')
  async findAllUnified(
    @Query(new ZodValidationPipe(QueryUnifiedSubmissionsSchema)) query: QueryUnifiedSubmissionsDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.submissionsService.findAllUnified(userId, userRole, query);
  }

  /**
   * Get grouped tests (problem/exam) and aggregate submission counters
   */
  @Get('tests')
  async findSubmissionTestGroups(
    @Query(new ZodValidationPipe(QuerySubmissionTestGroupsSchema))
    query: QuerySubmissionTestGroupsDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.submissionsService.findSubmissionTestGroups(userId, userRole, query);
  }

  /**
   * Get submitters and results for a specific test (problem or exam)
   */
  @Get('tests/:type/:entityId/submissions')
  async findSubmissionTestMembers(
    @Param('type') type: string,
    @Param('entityId') entityId: string,
    @Query(new ZodValidationPipe(QuerySubmissionTestMembersSchema))
    query: QuerySubmissionTestMembersDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.submissionsService.findSubmissionTestMembers(userId, userRole, type, entityId, query);
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
