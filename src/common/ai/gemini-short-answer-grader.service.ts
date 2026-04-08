import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GradeShortAnswerInput {
  question: string;
  referenceAnswer: string;
  studentAnswer: string;
  maxScore: number;
  explanation?: string | null;
}

interface ParsedGrade {
  score: number;
  isCorrect?: boolean;
  rationale?: string;
}

export interface ShortAnswerGradeResult {
  score: number;
  isCorrect: boolean;
  rationale?: string;
  model: string;
}

@Injectable()
export class GeminiShortAnswerGraderService {
  private readonly logger = new Logger(GeminiShortAnswerGraderService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('GEMINI_API_KEY'));
  }

  async grade(input: GradeShortAnswerInput): Promise<ShortAnswerGradeResult | null> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      return null;
    }

    const model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = this.buildPrompt(input);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.warn(
          `Gemini grading request failed (${response.status}): ${errorBody.slice(0, 200)}`,
        );
        return null;
      }

      const payload = await response.json();
      const text = this.extractTextResponse(payload);
      if (!text) {
        this.logger.warn('Gemini response has no text content for short answer grading');
        return null;
      }

      const parsed = this.parseGradePayload(text);
      if (!parsed) {
        this.logger.warn('Gemini response JSON parse failed for short answer grading');
        return null;
      }

      const clampedScore = this.clampScore(parsed.score, input.maxScore);
      const isCorrect =
        typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : clampedScore >= input.maxScore;

      return {
        score: clampedScore,
        isCorrect,
        rationale: parsed.rationale,
        model,
      };
    } catch (error) {
      this.logger.warn(
        `Gemini short answer grading failed: ${(error as Error)?.message ?? 'unknown error'}`,
      );
      return null;
    }
  }

  private buildPrompt(input: GradeShortAnswerInput): string {
    const parts = [
      'Bạn là trợ lý chấm điểm tự luận ngắn cho hệ thống thi.',
      'Nhiệm vụ: chấm câu trả lời của sinh viên dựa trên đáp án tham chiếu.',
      'Chỉ trả về JSON hợp lệ theo đúng schema, không thêm markdown.',
      `Schema: {"score": number, "isCorrect": boolean, "rationale": string}`,
      `score phải nằm trong [0, ${input.maxScore}] và có thể là điểm lẻ.`,
      'isCorrect = true chỉ khi câu trả lời đạt ý chính đầy đủ.',
      '',
      `Câu hỏi: ${input.question}`,
      `Đáp án tham chiếu: ${input.referenceAnswer}`,
      `Giải thích tham khảo: ${input.explanation || 'N/A'}`,
      `Bài làm sinh viên: ${input.studentAnswer}`,
    ];

    return parts.join('\n');
  }

  private extractTextResponse(payload: any): string | null {
    const candidates = payload?.candidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      return null;
    }

    const parts = candidates[0]?.content?.parts;
    if (!Array.isArray(parts)) {
      return null;
    }

    const textPart = parts.find((part: any) => typeof part?.text === 'string');
    return textPart?.text || null;
  }

  private parseGradePayload(raw: string): ParsedGrade | null {
    const direct = this.tryParseJson(raw.trim());
    if (direct) {
      return direct;
    }

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    return this.tryParseJson(raw.slice(start, end + 1));
  }

  private tryParseJson(candidate: string): ParsedGrade | null {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed?.score !== 'number' || Number.isNaN(parsed.score)) {
        return null;
      }

      return {
        score: parsed.score,
        isCorrect: typeof parsed?.isCorrect === 'boolean' ? parsed.isCorrect : undefined,
        rationale: typeof parsed?.rationale === 'string' ? parsed.rationale : undefined,
      };
    } catch {
      return null;
    }
  }

  private clampScore(rawScore: number, maxScore: number): number {
    const safeMax = Number.isFinite(maxScore) ? Math.max(0, maxScore) : 0;
    const normalized = Math.max(0, Math.min(safeMax, rawScore));
    return Math.round(normalized * 100) / 100;
  }
}
