import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionService } from './execution.service';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  ExecuteCodeSchema,
  ExecuteWithTestCasesSchema,
  RunTestCaseSchema,
} from './dto/execute-code.dto';
import type {
  ExecuteCodeDto,
  ExecuteWithTestCasesDto,
  RunTestCaseDto,
} from './dto/execute-code.dto';

@Controller('execution')
export class ExecutionController {
  constructor(private readonly executionService: ExecutionService) {}

  /**
   * Get list of available programming languages
   * Public endpoint
   */
  @Get('languages')
  async getLanguages() {
    return this.executionService.getAvailableLanguages();
  }

  /**
   * Execute code directly (for testing/playground)
   * Requires authentication
   */
  @Post('run')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async executeCode(@Body(new ZodValidationPipe(ExecuteCodeSchema)) dto: ExecuteCodeDto) {
    return this.executionService.executeCode(dto);
  }

  /**
   * Run code against a single test case
   * Requires authentication
   */
  @Post('test')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async runTestCase(@Body(new ZodValidationPipe(RunTestCaseSchema)) dto: RunTestCaseDto) {
    return this.executionService.runTestCase(dto);
  }

  /**
   * Submit code for evaluation against all test cases of a problem
   * Requires authentication
   */
  @Post('submit')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async submitCode(
    @Body(new ZodValidationPipe(ExecuteWithTestCasesSchema)) dto: ExecuteWithTestCasesDto,
  ) {
    return this.executionService.executeWithTestCases(dto);
  }
}
