import { Injectable, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
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
  type PistonResponse,
} from './dto/execution-response.dto';

@Injectable()
export class ExecutionService {
  private readonly pistonUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Default to public Piston API if not configured
    this.pistonUrl =
      this.configService.get<string>('PISTON_API_URL') || 'https://emkc.org/api/v2/piston';
  }

  /**
   * Get list of available languages from Piston
   */
  async getAvailableLanguages(): Promise<LanguageInfoDto[]> {
    try {
      const response = await fetch(`${this.pistonUrl}/runtimes`);

      if (!response.ok) {
        throw new HttpException(
          'Failed to fetch available languages',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const runtimes = (await response.json()) as Array<{
        language: string;
        version: string;
        aliases: string[];
        runtime?: string;
      }>;

      return runtimes.map(
        (r) =>
          new LanguageInfoDto({
            language: r.language,
            version: r.version,
            aliases: r.aliases,
            runtime: r.runtime,
          }),
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException('Piston service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Execute code with Piston API
   */
  async executeCode(dto: ExecuteCodeInput): Promise<ExecutionResultDto> {
    const startTime = performance.now();

    const functionName = dto.functionName || this.extractFunctionName(dto.language, dto.source);
    const source = this.generateDriverCode(dto.language, functionName, dto.source);

    const payload = {
      language: dto.language,
      version: dto.version,
      files: [{ content: source }],
      stdin: dto.stdin || '',
      args: dto.args || [],
      compile_timeout: dto.compileTimeout || 10000,
      run_timeout: dto.runTimeout || 5000,
      compile_memory_limit: dto.compileMemoryLimit || -1,
      run_memory_limit: dto.runMemoryLimit || -1,
    };

    try {
      const execStartTime = performance.now();
      const response = await fetch(`${this.pistonUrl}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const networkTime = performance.now() - execStartTime;

      if (!response.ok) {
        const errorBody = await response.text();
        throw new HttpException(`Execution failed: ${errorBody}`, HttpStatus.BAD_REQUEST);
      }

      const result = (await response.json()) as PistonResponse;
      const totalTime = performance.now() - startTime;

      // Check for compile error - check both compile phase and stderr for compilation keywords
      const hasCompilePhaseError =
        result.compile && (result.compile.code !== 0 || result.compile.stderr);
      const hasCompilationErrorInStderr =
        result.run.stderr?.includes('error: compilation failed') ||
        result.run.stderr?.includes('cannot find symbol') ||
        (result.run.stderr?.includes('error:') && result.run.code === 1);
      const isCompileError = hasCompilePhaseError || hasCompilationErrorInStderr;

      // Check for runtime error (only if not a compile error)
      const isRuntimeError =
        !isCompileError && (result.run.code !== 0 || result.run.signal !== null);

      return new ExecutionResultDto({
        language: result.language,
        version: result.version,
        stdout: result.run.stdout?.trim() || '',
        stderr: result.run.stderr?.trim() || '',
        output: result.run.output?.trim() || '',
        exitCode: result.run.code,
        signal: result.run.signal,
        isSuccess: !isCompileError && !isRuntimeError,
        isCompileError: !!isCompileError,
        compileOutput:
          result.compile?.output?.trim() ||
          result.compile?.stderr?.trim() ||
          (isCompileError ? result.run.stderr?.trim() : undefined),
        executionTime: Math.round(totalTime - networkTime), // Approximate execution time
        networkTime: Math.round(networkTime),
        totalTime: Math.round(totalTime),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
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
          if (result.signal === 'SIGKILL' || result.exitCode === 137) {
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
    const normalizeString = (str: string): string => {
      return str
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');
    };

    return normalizeString(actual) === normalizeString(expected);
  }

  /**
   * Get human-readable message for result
   */
  private getResultMessage(result: ExecutionResultDto, isCorrect: boolean): string {
    if (result.isCompileError) {
      return 'Compile Error';
    }
    if (result.signal === 'SIGKILL' || result.exitCode === 137) {
      return 'Time Limit Exceeded';
    }
    if (result.signal === 'SIGSEGV') {
      return 'Memory Limit Exceeded';
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
  ): string {
    const normalized = language.toLowerCase();

    if (normalized === 'javascript') {
      if (!functionName) {
        throw new HttpException(
          'Function name is required for JavaScript submissions',
          HttpStatus.BAD_REQUEST,
        );
      }

      return `"use strict";
${userSource}

const fs = require('fs');
const rawInput = fs.readFileSync(0, 'utf8').trim();
let args = [];
if (rawInput.length > 0) {
  try {
    args = JSON.parse('[' + rawInput + ']');
  } catch (err) {
    throw new Error('Invalid input format. Expect single-line, comma-separated arguments.');
  }
}

if (typeof ${functionName} !== 'function') {
  throw new Error('Function ${functionName} not found');
}

const result = ${functionName}(...args);
if (result !== undefined) {
  if (result !== null && typeof result === 'object') {
    process.stdout.write(JSON.stringify(result));
  } else {
    process.stdout.write(String(result));
  }
}
`;
    }

    if (normalized === 'python') {
      if (!functionName) {
        throw new HttpException(
          'Function name is required for Python submissions',
          HttpStatus.BAD_REQUEST,
        );
      }

      return `${userSource}

import sys
import json

raw_input = sys.stdin.read().strip()
args = []
if raw_input:
    try:
        args = json.loads('[' + raw_input + ']')
    except Exception:
        raise ValueError('Invalid input format. Expect single-line, comma-separated arguments.')

if '${functionName}' not in globals() or not callable(globals()['${functionName}']):
    raise NameError('Function ${functionName} not found')

result = globals()['${functionName}'](*args)
if result is not None:
    if isinstance(result, (list, dict, tuple)):
        sys.stdout.write(json.dumps(result))
    else:
        sys.stdout.write(str(result))
`;
    }

    return userSource;
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
