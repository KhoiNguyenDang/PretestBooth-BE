import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProblemsService } from './problems.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import { CreateProblemSchema } from './dto/create-problem.dto';
import type { CreateProblemDto } from './dto/create-problem.dto';
import { UpdateProblemSchema } from './dto/update-problem.dto';
import type { UpdateProblemDto } from './dto/update-problem.dto';
import { CreateTestCaseSchema, CreateBulkTestCasesSchema } from './dto/create-testcase.dto';
import type { CreateTestCaseDto, CreateBulkTestCasesDto } from './dto/create-testcase.dto';
import { UpdateTestCaseSchema } from './dto/update-testcase.dto';
import type { UpdateTestCaseDto } from './dto/update-testcase.dto';
import { QueryProblemSchema } from './dto/query-problem.dto';
import type { QueryProblemDto } from './dto/query-problem.dto';

@Controller('problems')
export class ProblemsController {
  constructor(private readonly problemsService: ProblemsService) {}

  // ==================== PROBLEM ENDPOINTS ====================

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@Body(new ZodValidationPipe(CreateProblemSchema)) dto: CreateProblemDto, @Req() req) {
    const userId = req.user['sub'];
    return this.problemsService.create(userId, dto);
  }

  @Get()
  findAll(@Query(new ZodValidationPipe(QueryProblemSchema)) query: QueryProblemDto, @Req() req) {
    const userId = req.user?.['sub'];
    const userRole = req.user?.['role'];
    return this.problemsService.findAll(query, userId, userRole);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @Req() req) {
    const userId = req.user?.['sub'];
    const userRole = req.user?.['role'];
    return this.problemsService.findBySlug(slug, userId, userRole);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    const userId = req.user?.['sub'];
    const userRole = req.user?.['role'];
    return this.problemsService.findOne(id, userId, userRole);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProblemSchema)) dto: UpdateProblemDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.problemsService.update(id, dto, userId, userRole);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.problemsService.remove(id, userId, userRole);
  }

  // ==================== TEST CASE ENDPOINTS ====================

  @Post(':problemId/testcases')
  @UseGuards(AuthGuard('jwt'))
  createTestCase(
    @Param('problemId') problemId: string,
    @Body(new ZodValidationPipe(CreateTestCaseSchema)) dto: CreateTestCaseDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.problemsService.createTestCase(problemId, dto, userId, userRole);
  }

  @Post(':problemId/testcases/bulk')
  @UseGuards(AuthGuard('jwt'))
  createBulkTestCases(
    @Param('problemId') problemId: string,
    @Body(new ZodValidationPipe(CreateBulkTestCasesSchema)) dto: CreateBulkTestCasesDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.problemsService.createBulkTestCases(problemId, dto, userId, userRole);
  }

  @Get(':problemId/testcases')
  getTestCases(@Param('problemId') problemId: string, @Req() req) {
    const userId = req.user?.['sub'];
    const userRole = req.user?.['role'];
    return this.problemsService.getTestCases(problemId, userId, userRole);
  }

  @Patch('testcases/:testCaseId')
  @UseGuards(AuthGuard('jwt'))
  updateTestCase(
    @Param('testCaseId') testCaseId: string,
    @Body(new ZodValidationPipe(UpdateTestCaseSchema)) dto: UpdateTestCaseDto,
    @Req() req,
  ) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.problemsService.updateTestCase(testCaseId, dto, userId, userRole);
  }

  @Delete('testcases/:testCaseId')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  removeTestCase(@Param('testCaseId') testCaseId: string, @Req() req) {
    const userId = req.user['sub'];
    const userRole = req.user['role'];
    return this.problemsService.removeTestCase(testCaseId, userId, userRole);
  }
}
