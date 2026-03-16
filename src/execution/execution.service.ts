import { Injectable, HttpException, HttpStatus, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ExecuteCodeInput,
  ExecuteWithTestCasesInput,
  RunTestCaseDto,
} from './dto/execute-code.dto';
import {
  ExecutionResultDto,
  TestCaseResultDto,
  SubmissionResultDto,
  LanguageInfoDto,
} from './dto/execution-response.dto';

import { generateJavascriptDriver, generatePythonDriver, generateJavaDriver } from './drivers';
import {
  resolveLanguageId,
  mapJudge0Status,
  Judge0StatusId,
  type Judge0SubmissionResponse,
} from './judge0-languages';

@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly judge0Url: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.judge0Url =
      this.configService.get<string>('JUDGE0_API_URL') || 'http://localhost:2358';
  }

  /**
   * Get list of available languages from Judge0
   */
  async getAvailableLanguages(): Promise<LanguageInfoDto[]> {
    try {
      const response = await fetch(`${this.judge0Url}/languages`);

      if (!response.ok) {
        throw new HttpException(
          'Failed to fetch available languages',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const languages = (await response.json()) as Array<{
        id: number;
        name: string;
      }>;

      return languages.map(
        (l) =>
          new LanguageInfoDto({
            language: l.name,
            version: '',
            aliases: [],
            runtime: undefined,
            languageId: l.id,
          }),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Judge0 service unavailable: ${(error as Error).message}`);
      throw new HttpException('Judge0 service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Execute code with Judge0 API
   */
  async executeCode(dto: ExecuteCodeInput): Promise<ExecutionResultDto> {
    const startTime = performance.now();

    const functionName = dto.functionName || this.extractFunctionName(dto.language, dto.source);
    const source = this.generateDriverCode(
      dto.language,
      functionName,
      dto.source,
      dto.inputTypes || [],
    );

    const languageId = resolveLanguageId(dto.language);

    // Judge0 expects base64-encoded source code and stdin
    const payload = {
      language_id: languageId,
      source_code: Buffer.from(source).toString('base64'),
      stdin: dto.stdin ? Buffer.from(dto.stdin).toString('base64') : '',
      cpu_time_limit: (dto.runTimeout || 5000) / 1000, // Convert ms to seconds
      cpu_extra_time: 2,
      wall_time_limit: ((dto.runTimeout || 5000) / 1000) + 5,
      memory_limit: dto.runMemoryLimit && dto.runMemoryLimit > 0 ? dto.runMemoryLimit * 1024 : 256000, // Convert MB to KB
    };

    try {
      const execStartTime = performance.now();
      const response = await fetch(
        `${this.judge0Url}/submissions?base64_encoded=true&wait=true`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const networkTime = performance.now() - execStartTime;

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Judge0 execution failed: ${errorBody}`);
        throw new HttpException(`Execution failed: ${errorBody}`, HttpStatus.BAD_REQUEST);
      }

      const result = (await response.json()) as Judge0SubmissionResponse;
      const totalTime = performance.now() - startTime;

      // Decode base64 outputs
      const stdout = result.stdout ? Buffer.from(result.stdout, 'base64').toString('utf-8') : '';
      const stderr = result.stderr ? Buffer.from(result.stderr, 'base64').toString('utf-8') : '';
      const compileOutput = result.compile_output
        ? Buffer.from(result.compile_output, 'base64').toString('utf-8')
        : undefined;

      const statusId = result.status.id;
      const isCompileError = statusId === Judge0StatusId.COMPILATION_ERROR;
      const isRuntimeErr =
        statusId >= Judge0StatusId.RUNTIME_ERROR_SIGSEGV &&
        statusId <= Judge0StatusId.RUNTIME_ERROR_OTHER;
      const isSuccess = statusId === Judge0StatusId.ACCEPTED;

      // Parse execution time from Judge0 (seconds → ms)
      const executionTimeMs = result.time ? Math.round(parseFloat(result.time) * 1000) : 0;

      return new ExecutionResultDto({
        language: dto.language,
        version: '',
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        output: stdout.trim(),
        exitCode: result.exit_code,
        signal: result.exit_signal ? `signal ${result.exit_signal}` : null,
        isSuccess,
        isCompileError,
        compileOutput: compileOutput?.trim(),
        executionTime: executionTimeMs,
        networkTime: Math.round(networkTime),
        totalTime: Math.round(totalTime),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Judge0 execution error: ${(error as Error).message}`);
      throw new HttpException(
        `Execution service error: ${(error as Error).message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Run code against a single test case
   */
  async runTestCase(dto: RunTestCaseDto): Promise<TestCaseResultDto> {
    const result = await this.executeCode({
      language: dto.language,
      version: dto.version,
      source: dto.source,
      functionName: dto.functionName,
      stdin: dto.input,
      runTimeout: dto.runTimeout,
      inputTypes: dto.inputTypes,
    });

    const actualOutput = result.stdout.trim();
    const expectedOutput = dto.expectedOutput.trim();
    const isCorrect = this.compareOutput(actualOutput, expectedOutput);

    return new TestCaseResultDto({
      testCaseId: '',
      input: dto.input,
      expectedOutput: expectedOutput,
      actualOutput: actualOutput,
      stdout: result.stdout,
      stderr: result.stderr,
      isCorrect,
      isHidden: false,
      isSample: false,
      order: 0,
      executionTime: result.totalTime,
      passed: isCorrect && result.isSuccess,
      message: this.getResultMessage(result, isCorrect),
    });
  }

  /**
   * Execute code against all test cases of a problem
   */
  async executeWithTestCases(dto: ExecuteWithTestCasesInput): Promise<SubmissionResultDto> {
    const startTime = performance.now();

    // Fetch problem with test cases
    const problem = await this.prisma.problem.findUnique({
      where: { id: dto.problemId },
      include: {
        testCases: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!problem) {
      throw new NotFoundException('Problem not found');
    }

    const testCaseResults: TestCaseResultDto[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let isCompileError = false;
    let compileOutput: string | undefined;
    let totalExecutionTime = 0;
    let totalNetworkTime = 0;
    let status: SubmissionResultDto['status'] = 'ACCEPTED';

    // Execute against each test case
    for (const testCase of problem.testCases) {
      const result = await this.executeCode({
        language: dto.language,
        version: dto.version,
        source: dto.source,
        functionName: dto.functionName,
        stdin: testCase.input,
        runTimeout: dto.runTimeout || problem.timeLimit,
        inputTypes: problem.inputTypes || [],
      });

      // Check for compile error (only need to check once)
      if (result.isCompileError && !isCompileError) {
        isCompileError = true;
        compileOutput = result.compileOutput;
        status = 'COMPILE_ERROR';

        // Add failed result for this test case and break
        testCaseResults.push(
          new TestCaseResultDto({
            testCaseId: testCase.id,
            input: testCase.isHidden ? '[Hidden]' : testCase.input,
            expectedOutput: testCase.isHidden ? '[Hidden]' : testCase.expectedOutput,
            actualOutput: '',
            stdout: '',
            stderr: result.compileOutput || 'Compile error',
            isCorrect: false,
            isHidden: testCase.isHidden,
            isSample: testCase.isSample,
            order: testCase.order,
            executionTime: result.totalTime,
            passed: false,
            message: 'Compile Error',
          }),
        );
        failedCount++;
        break;
      }

      const actualOutput = result.stdout.trim();
      const expectedOutput = testCase.expectedOutput.trim();
      const isCorrect = this.compareOutput(actualOutput, expectedOutput);

      totalExecutionTime += result.executionTime;
      totalNetworkTime += result.networkTime;

      if (isCorrect && result.isSuccess) {
        passedCount++;
      } else {
        failedCount++;
        if (status === 'ACCEPTED') {
          if (result.signal || result.exitCode === 137) {
            status = 'TIME_LIMIT_EXCEEDED';
          } else if (!result.isSuccess) {
            status = 'RUNTIME_ERROR';
          } else {
            status = 'WRONG_ANSWER';
          }
        }
      }

      testCaseResults.push(
        new TestCaseResultDto({
          testCaseId: testCase.id,
          input: testCase.isHidden ? '[Hidden]' : testCase.input,
          expectedOutput: testCase.isHidden ? '[Hidden]' : testCase.expectedOutput,
          actualOutput: testCase.isHidden ? '[Hidden]' : actualOutput,
          stdout: testCase.isHidden ? '[Hidden]' : result.stdout,
          stderr: result.stderr,
          isCorrect,
          isHidden: testCase.isHidden,
          isSample: testCase.isSample,
          order: testCase.order,
          executionTime: result.totalTime,
          passed: isCorrect && result.isSuccess,
          message: this.getResultMessage(result, isCorrect),
        }),
      );
    }

    const totalTime = performance.now() - startTime;
    const isAllPassed = passedCount === problem.testCases.length && !isCompileError;

    if (isAllPassed) {
      status = 'ACCEPTED';
    }

    return new SubmissionResultDto({
      language: dto.language,
      version: dto.version,
      problemId: dto.problemId,
      totalTestCases: problem.testCases.length,
      passedTestCases: passedCount,
      failedTestCases: failedCount,
      isAllPassed,
      isCompileError,
      compileOutput,
      testCaseResults,
      totalExecutionTime,
      totalNetworkTime,
      totalTime: Math.round(totalTime),
      status,
    });
  }

  /**
   * Compare actual output with expected output
   * Handles whitespace normalization
   */
  private compareOutput(actual: string, expected: string): boolean {
    // Normalize whitespace: trim and normalize line endings
    const normalize = (str: string) => str.replace(/\s+/g, '');

    return normalize(actual) === normalize(expected);
  }

  /**
   * Get human-readable message for result
   */
  private getResultMessage(result: ExecutionResultDto, isCorrect: boolean): string {
    if (result.isCompileError) {
      return 'Compile Error';
    }
    if (result.signal) {
      return 'Time Limit Exceeded';
    }
    if (!result.isSuccess) {
      return `Runtime Error (exit code: ${result.exitCode})`;
    }
    if (!isCorrect) {
      return 'Wrong Answer';
    }
    return 'Accepted';
  }

  /**
   * Generate driver code that parses single-line inputs and calls the solution function.
   */
  private generateDriverCode(
    language: string,
    functionName: string | undefined,
    userSource: string,
    inputTypes: string[] = [],
  ): string {
    const normalized = language.toLowerCase();

    switch (normalized) {
      case 'javascript':
        if (!functionName)
          throw new HttpException('Function name required for JS', HttpStatus.BAD_REQUEST);
        return generateJavascriptDriver(userSource, functionName);

      case 'python':
        if (!functionName)
          throw new HttpException('Function name required for Python', HttpStatus.BAD_REQUEST);
        return generatePythonDriver(userSource, functionName);

      case 'java':
        if (!functionName)
          throw new HttpException('Function name required for Java', HttpStatus.BAD_REQUEST);
        return generateJavaDriver(userSource, functionName, inputTypes);

      case 'cpp':
        return userSource;

      case 'csharp':
        return userSource;

      default:
        return userSource;
    }
  }

  /**
   * Attempt to extract function name from user source.
   */
  private extractFunctionName(language: string, source: string): string | undefined {
    const normalized = language.toLowerCase();

    if (normalized === 'javascript') {
      const functionDecl = source.match(/function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (functionDecl?.[1]) return functionDecl[1];

      const arrowDecl = source.match(
        /(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
      );
      if (arrowDecl?.[2]) return arrowDecl[2];

      const exportDecl = source.match(/export\s+(default\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (exportDecl?.[2]) return exportDecl[2];
    }

    if (normalized === 'python') {
      const defDecl = source.match(/def\s+([A-Za-z_][\w]*)\s*\(/);
      if (defDecl?.[1]) return defDecl[1];
    }

    return undefined;
  }
}
