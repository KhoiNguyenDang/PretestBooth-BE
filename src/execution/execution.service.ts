import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
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
export class ExecutionService implements OnModuleInit {
  private readonly logger = new Logger(ExecutionService.name);
  private readonly judge0Url: string;
  private static readonly JUDGE0_EXEC_TIMEOUT_MS = 30_000;
  private static readonly JUDGE0_HEALTHCHECK_TIMEOUT_MS = 5_000;
  private static readonly JUDGE0_EXEC_RETRIES = 2;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.judge0Url =
      this.configService.get<string>('JUDGE0_API_URL') || 'http://localhost:2358';
  }

  async onModuleInit(): Promise<void> {
    if (!this.judge0Url) {
      throw new Error('JUDGE0_API_URL is not configured');
    }

    try {
      // Validate URL shape early to fail fast on invalid config.
      // eslint-disable-next-line no-new
      new URL(this.judge0Url);
    } catch {
      throw new Error(`Invalid JUDGE0_API_URL: ${this.judge0Url}`);
    }

    try {
      const response = await this.fetchWithTimeout(
        `${this.judge0Url}/languages`,
        { method: 'GET' },
        ExecutionService.JUDGE0_HEALTHCHECK_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`Judge0 healthcheck failed with status ${response.status}`);
      }
    } catch (error) {
      this.logger.error(`Judge0 healthcheck failed: ${(error as Error).message}`);
      throw new Error(`Judge0 is unavailable at ${this.judge0Url}`);
    }
  }

  /**
   * Get list of available languages from Judge0
   */
  async getAvailableLanguages(): Promise<LanguageInfoDto[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.judge0Url}/languages`,
        { method: 'GET' },
        ExecutionService.JUDGE0_HEALTHCHECK_TIMEOUT_MS,
      );

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
        (l) => {
          const parsed = this.parseJudge0LanguageInfo(l.name);
          return new LanguageInfoDto({
            language: parsed.language,
            version: parsed.version,
            aliases: parsed.aliases,
            runtime: parsed.runtime,
            languageId: l.id,
          });
        },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Judge0 service unavailable: ${(error as Error).message}`);
      throw new HttpException('Judge0 service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private parseJudge0LanguageInfo(name: string): {
    language: string;
    version: string;
    aliases: string[];
    runtime: string;
  } {
    const runtime = name.trim();
    const match = runtime.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
    const rawBase = (match?.[1] || runtime).trim().toLowerCase();
    const version = (match?.[2] || '').trim();

    let language = rawBase;
    if (rawBase.includes('c++')) language = 'cpp';
    else if (rawBase === 'c') language = 'c';
    else if (rawBase.includes('c#')) language = 'csharp';
    else if (rawBase.includes('javascript') || rawBase.includes('node.js')) language = 'javascript';
    else if (rawBase.includes('typescript')) language = 'typescript';
    else if (rawBase.startsWith('python')) language = 'python';
    else if (rawBase.startsWith('java')) language = 'java';
    else if (rawBase.startsWith('go')) language = 'go';
    else if (rawBase.startsWith('rust')) language = 'rust';
    else if (rawBase.startsWith('ruby')) language = 'ruby';
    else if (rawBase.startsWith('php')) language = 'php';
    else if (rawBase.startsWith('swift')) language = 'swift';
    else if (rawBase.startsWith('kotlin')) language = 'kotlin';

    const aliases = new Set<string>([language, rawBase, runtime.toLowerCase()]);
    if (language === 'python') {
      aliases.add('python3');
      aliases.add('py');
    }
    if (language === 'javascript') {
      aliases.add('js');
      aliases.add('node');
    }
    if (language === 'cpp') {
      aliases.add('c++');
      aliases.add('g++');
    }

    return {
      language,
      version,
      aliases: [...aliases],
      runtime,
    };
  }

  private getCompilerOptions(language: string): string | undefined {
    if (language.toLowerCase() === 'java') {
      // Keep javac memory bounded for self-hosted Judge0 environments.
      return '-J-Xms16m -J-Xmx64m -J-XX:MaxMetaspaceSize=64m -J-XX:ReservedCodeCacheSize=32m';
    }

    return undefined;
  }

  /**
   * Execute code with Judge0 API
   */
  async executeCode(dto: ExecuteCodeInput): Promise<ExecutionResultDto> {
    const startTime = performance.now();

    const functionName = this.resolveFunctionName(dto.language, dto.functionName, dto.source);
    const source = this.generateDriverCode(
      dto.language,
      functionName,
      dto.source,
      dto.inputTypes || [],
    );

    const languageId = resolveLanguageId(dto.language);
    const isJava = dto.language.toLowerCase() === 'java';
    const defaultMemoryLimitKb = isJava ? 1024000 : 256000;

    // Judge0 expects base64-encoded source code and stdin
    const payload = {
      language_id: languageId,
      source_code: Buffer.from(source).toString('base64'),
      stdin: dto.stdin ? Buffer.from(dto.stdin).toString('base64') : '',
      cpu_time_limit: (dto.runTimeout || 5000) / 1000, // Convert ms to seconds
      cpu_extra_time: 2,
      wall_time_limit: ((dto.runTimeout || 5000) / 1000) + 5,
      memory_limit:
        dto.runMemoryLimit && dto.runMemoryLimit > 0
          ? dto.runMemoryLimit * 1024
          : defaultMemoryLimitKb, // Convert MB to KB
      compiler_options: this.getCompilerOptions(dto.language),
    };

    try {
      const execStartTime = performance.now();
      const response = await this.submitToJudge0WithRetry(payload);
      const networkTime = performance.now() - execStartTime;

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`Judge0 execution failed: ${errorBody}`);
        throw new HttpException(`Execution failed: ${errorBody}`, HttpStatus.BAD_REQUEST);
      }

      const result = (await response.json()) as Judge0SubmissionResponse;
      const totalTime = performance.now() - startTime;

      // Decode base64 outputs
      const stdout = this.safeDecodeBase64(result.stdout, 'stdout');
      const stderr = this.safeDecodeBase64(result.stderr, 'stderr');
      const compileOutput = result.compile_output
        ? this.safeDecodeBase64(result.compile_output, 'compile_output')
        : undefined;
      const judge0Message = this.safeDecodeBase64(result.message, 'message');

      const statusId = result.status.id;
      const mappedStatus = mapJudge0Status(statusId);
      const isCompileError = mappedStatus === 'COMPILE_ERROR';
      const isSuccess = mappedStatus === 'ACCEPTED';
      const normalizedStderr = stderr || judge0Message;

      // Parse execution time from Judge0 (seconds → ms)
      const executionTimeMs = result.time ? Math.round(parseFloat(result.time) * 1000) : 0;

      return new ExecutionResultDto({
        language: dto.language,
        version: '',
        status: mappedStatus,
        stdout: stdout.trim(),
        stderr: normalizedStderr.trim(),
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
      if ((error as Error).name === 'AbortError') {
        throw new HttpException('Execution timed out while waiting for Judge0', HttpStatus.GATEWAY_TIMEOUT);
      }
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
    // Keep token boundaries to avoid matching "1 2 3" with "123".
    const normalize = (str: string) => str.replace(/\r\n/g, '\n').trim().replace(/[ \t\f\v]+/g, ' ');

    return normalize(actual) === normalize(expected);
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async submitToJudge0WithRetry(payload: object): Promise<Response> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= ExecutionService.JUDGE0_EXEC_RETRIES) {
      try {
        const response = await this.fetchWithTimeout(
          `${this.judge0Url}/submissions?base64_encoded=true&wait=true`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          ExecutionService.JUDGE0_EXEC_TIMEOUT_MS,
        );

        const shouldRetry = response.status >= 500 && response.status <= 599;
        if (!shouldRetry || attempt === ExecutionService.JUDGE0_EXEC_RETRIES) {
          return response;
        }
      } catch (error) {
        const err = error as Error;
        lastError = err;
        if (err.name !== 'AbortError' && attempt === ExecutionService.JUDGE0_EXEC_RETRIES) {
          throw err;
        }
      }

      const waitMs = 300 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      attempt += 1;
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Judge0 request failed after retries');
  }

  private safeDecodeBase64(value: string | null, fieldName: string): string {
    if (!value) {
      return '';
    }

    try {
      return Buffer.from(value, 'base64').toString('utf-8');
    } catch (error) {
      this.logger.warn(
        `Failed to decode Judge0 ${fieldName}: ${(error as Error).message}`,
      );
      return '';
    }
  }

  /**
   * Get human-readable message for result
   */
  private getResultMessage(result: ExecutionResultDto, isCorrect: boolean): string {
    if (result.isCompileError) {
      return 'Compile Error';
    }
    if (result.status === 'TIME_LIMIT_EXCEEDED' || result.signal) {
      return 'Time Limit Exceeded';
    }
    if (!isCorrect) {
      return 'Wrong Answer';
    }
    if (!result.isSuccess) {
      const hasExitCode = typeof result.exitCode === 'number';
      return hasExitCode
        ? `Runtime Error (exit code: ${result.exitCode})`
        : 'Runtime Error';
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

  private resolveFunctionName(
    language: string,
    requestedFunctionName: string | undefined,
    source: string,
  ): string | undefined {
    const extracted = this.extractFunctionName(language, source);

    if (!requestedFunctionName) {
      return extracted;
    }

    const normalized = language.toLowerCase();

    if (normalized === 'python') {
      const hasRequestedDef = new RegExp(
        `\\bdef\\s+${this.escapeRegExp(requestedFunctionName)}\\s*\\(`,
      ).test(source);

      if (hasRequestedDef) {
        return requestedFunctionName;
      }

      return extracted || requestedFunctionName;
    }

    if (normalized === 'javascript') {
      const hasRequestedFn = new RegExp(
        `\\bfunction\\s+${this.escapeRegExp(requestedFunctionName)}\\s*\\(`,
      ).test(source);
      const hasRequestedVar = new RegExp(
        `\\b(const|let|var)\\s+${this.escapeRegExp(requestedFunctionName)}\\s*=`,
      ).test(source);

      if (hasRequestedFn || hasRequestedVar) {
        return requestedFunctionName;
      }

      return extracted || requestedFunctionName;
    }

    return requestedFunctionName;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  }
}
