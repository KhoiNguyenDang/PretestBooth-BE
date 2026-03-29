import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';

export interface FaceEmbeddingResult {
  embedding: number[];
  model: string;
  version: string;
  norm: number;
}

interface FaceEmbeddingServiceResponse {
  embedding: number[];
  model?: string;
  version?: string;
}

@Injectable()
export class FaceRecognitionService {
  private readonly logger = new Logger(FaceRecognitionService.name);
  private readonly embeddingServiceUrl = process.env.FACE_EMBEDDING_SERVICE_URL;
  private readonly embeddingServiceApiKey = process.env.FACE_EMBEDDING_SERVICE_API_KEY;
  private readonly useMockEmbedding =
    (process.env.FACE_EMBEDDING_USE_MOCK ?? 'false').toLowerCase() === 'true';
  private readonly defaultModel = process.env.FACE_EMBEDDING_MODEL ?? 'arcface-r100';
  private readonly expectedDimension = Number(process.env.FACE_EMBEDDING_DIM ?? 512);

  async extractEmbedding(imageDataUrl: string): Promise<FaceEmbeddingResult> {
    this.validateImageInput(imageDataUrl);

    if (this.embeddingServiceUrl && !this.useMockEmbedding) {
      return this.extractFromEmbeddingService(imageDataUrl);
    }

    if (!this.useMockEmbedding) {
      throw new InternalServerErrorException(
        'FACE_EMBEDDING_SERVICE_URL chưa được cấu hình. Vui lòng cấu hình service hoặc bật FACE_EMBEDDING_USE_MOCK=true cho môi trường local.',
      );
    }

    const embedding = this.createMockEmbedding(imageDataUrl);
    const norm = this.calculateNorm(embedding);

    return {
      embedding,
      model: 'mock-sha512',
      version: '1',
      norm,
    };
  }

  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length === 0 || vectorB.length === 0) {
      throw new BadRequestException('Embedding rỗng, không thể so khớp');
    }

    if (vectorA.length !== vectorB.length) {
      throw new BadRequestException('Hai embedding không cùng số chiều');
    }

    const normalizedA = this.normalize(vectorA);
    const normalizedB = this.normalize(vectorB);

    let dotProduct = 0;
    for (let i = 0; i < normalizedA.length; i++) {
      dotProduct += normalizedA[i] * normalizedB[i];
    }

    return Number(dotProduct.toFixed(6));
  }

  normalize(vector: number[]): number[] {
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new BadRequestException('Embedding không hợp lệ');
    }

    const sanitized = vector.map((value) => {
      if (!Number.isFinite(value)) {
        throw new BadRequestException('Embedding chứa giá trị không hợp lệ');
      }
      return Number(value);
    });

    const norm = this.calculateNorm(sanitized);
    if (norm === 0) {
      throw new BadRequestException('Embedding có chuẩn bằng 0, không thể chuẩn hóa');
    }

    return sanitized.map((value) => value / norm);
  }

  calculateNorm(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  }

  private validateImageInput(imageDataUrl: string) {
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      throw new BadRequestException('Thiếu dữ liệu ảnh khuôn mặt');
    }

    if (!imageDataUrl.startsWith('data:image/')) {
      throw new BadRequestException('Ảnh khuôn mặt phải ở định dạng data URL');
    }
  }

  private async extractFromEmbeddingService(
    imageDataUrl: string,
  ): Promise<FaceEmbeddingResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.embeddingServiceApiKey) {
      headers['x-api-key'] = this.embeddingServiceApiKey;
    }

    let response: globalThis.Response;
    try {
      response = await fetch(this.embeddingServiceUrl as string, {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: imageDataUrl }),
      });
    } catch (error) {
      this.logger.error('Không kết nối được face embedding service', error as Error);
      throw new InternalServerErrorException(
        'Không thể kết nối dịch vụ trích xuất khuôn mặt',
      );
    }

    if (!response.ok) {
      const payload = await response.text();
      this.logger.error(
        `Face embedding service trả lỗi ${response.status}: ${payload}`,
      );
      throw new InternalServerErrorException(
        'Dịch vụ trích xuất khuôn mặt đang tạm thời không khả dụng',
      );
    }

    const result = (await response.json()) as FaceEmbeddingServiceResponse;

    if (!Array.isArray(result.embedding) || result.embedding.length === 0) {
      throw new InternalServerErrorException(
        'Dữ liệu embedding trả về từ dịch vụ không hợp lệ',
      );
    }

    const normalized = this.normalize(result.embedding.map((item) => Number(item)));

    return {
      embedding: normalized,
      model: result.model ?? this.defaultModel,
      version: result.version ?? '1',
      norm: this.calculateNorm(normalized),
    };
  }

  private createMockEmbedding(imageDataUrl: string): number[] {
    const digest = createHash('sha512').update(imageDataUrl).digest();
    const rawVector: number[] = [];

    for (let i = 0; i < this.expectedDimension; i++) {
      const byte = digest[i % digest.length];
      rawVector.push((byte / 255) * 2 - 1);
    }

    return this.normalize(rawVector);
  }
}
