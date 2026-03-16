/**
 * Judge0 Language ID Mapping
 *
 * Maps common language names/aliases to Judge0 CE language IDs.
 * Full list: GET http://localhost:2358/languages
 *
 * Reference: https://github.com/judge0/judge0/blob/master/docs/api/submissions/languages.md
 */

export const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
  // C / C++
  c: 50,          // C (GCC 9.2.0)
  cpp: 54,        // C++ (GCC 9.2.0)
  'c++': 54,
  'g++': 54,

  // Java
  java: 62,       // Java (OpenJDK 13.0.1)

  // Python
  python: 71,     // Python (3.8.1)
  python3: 71,
  py: 71,

  // JavaScript / TypeScript
  javascript: 63, // JavaScript (Node.js 12.14.0)
  js: 63,
  node: 63,
  typescript: 74, // TypeScript (3.7.4)
  ts: 74,

  // C#
  csharp: 51,     // C# (Mono 6.6.0.161)
  'c#': 51,
  cs: 51,

  // Go
  go: 60,         // Go (1.13.5)
  golang: 60,

  // Rust
  rust: 73,       // Rust (1.40.0)
  rs: 73,

  // Ruby
  ruby: 72,       // Ruby (2.7.0)
  rb: 72,

  // PHP
  php: 68,        // PHP (7.4.1)

  // Swift
  swift: 83,      // Swift (5.2.3)

  // Kotlin
  kotlin: 78,     // Kotlin (1.3.70)
  kt: 78,
};

/**
 * Judge0 submission status IDs
 */
export enum Judge0StatusId {
  IN_QUEUE = 1,
  PROCESSING = 2,
  ACCEPTED = 3,
  WRONG_ANSWER = 4,
  TIME_LIMIT_EXCEEDED = 5,
  COMPILATION_ERROR = 6,
  RUNTIME_ERROR_SIGSEGV = 7,
  RUNTIME_ERROR_SIGXFSZ = 8,
  RUNTIME_ERROR_SIGFPE = 9,
  RUNTIME_ERROR_SIGABRT = 10,
  RUNTIME_ERROR_NZEC = 11,
  RUNTIME_ERROR_OTHER = 12,
  INTERNAL_ERROR = 13,
  EXEC_FORMAT_ERROR = 14,
}

/**
 * Judge0 API response shape
 */
export interface Judge0SubmissionResponse {
  token: string;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  exit_code: number | null;
  exit_signal: number | null;
  status: {
    id: number;
    description: string;
  };
  time: string | null;       // seconds as string, e.g. "0.01"
  wall_time: string | null;
  memory: number | null;     // KB
}

/**
 * Resolve a language name to a Judge0 language ID.
 * Throws if the language is not supported.
 */
export function resolveLanguageId(language: string): number {
  const normalized = language.toLowerCase().trim();
  const id = JUDGE0_LANGUAGE_MAP[normalized];
  if (!id) {
    throw new Error(
      `Unsupported language: "${language}". Supported: ${Object.keys(JUDGE0_LANGUAGE_MAP).join(', ')}`,
    );
  }
  return id;
}

/**
 * Check if a Judge0 status indicates a runtime error (IDs 7-12).
 */
export function isRuntimeError(statusId: number): boolean {
  return statusId >= 7 && statusId <= 12;
}

/**
 * Map Judge0 status ID to internal status string.
 */
export function mapJudge0Status(
  statusId: number,
): 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' {
  switch (statusId) {
    case Judge0StatusId.ACCEPTED:
      return 'ACCEPTED';
    case Judge0StatusId.WRONG_ANSWER:
      return 'WRONG_ANSWER';
    case Judge0StatusId.TIME_LIMIT_EXCEEDED:
      return 'TIME_LIMIT_EXCEEDED';
    case Judge0StatusId.COMPILATION_ERROR:
      return 'COMPILE_ERROR';
    default:
      if (isRuntimeError(statusId)) {
        return 'RUNTIME_ERROR';
      }
      return 'RUNTIME_ERROR';
  }
}
