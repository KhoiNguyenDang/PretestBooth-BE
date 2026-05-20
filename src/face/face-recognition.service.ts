import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnprocessableEntityException,
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
    // If a remote URL is provided (cloudinary secure url), fetch and convert it to a data URL
    if (typeof imageDataUrl === 'string' && (imageDataUrl.startsWith('http://') || imageDataUrl.startsWith('https://'))) {
      imageDataUrl = await this.fetchRemoteImageAsDataUrl(imageDataUrl);
    }

    this.validateImageInput(imageDataUrl);

    if (this.embeddingServiceUrl && !this.useMockEmbedding) {
      return this.extractFromEmbeddingService(imageDataUrl);
    }

    if (!this.useMockEmbedding) {
      throw new InternalServerErrorException(
        'Dịch vụ nhận diện khuôn mặt chưa được cấu hình. Vui lòng liên hệ quản trị viên hoặc thử lại sau.',
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

  private async fetchRemoteImageAsDataUrl(url: string): Promise<string> {
    let response: globalThis.Response;
    try {
      response = await fetch(url);
    } catch (error) {
      this.logger.error(`Failed to fetch remote image ${url}`, error as Error);
      throw new BadRequestException('Không thể tải ảnh từ nguồn bên ngoài. Vui lòng thử lại.');
    }

    if (!response.ok) {
      this.logger.error(`Fetching remote image returned ${response.status} for ${url}`);
      throw new BadRequestException('Không thể tải ảnh từ nguồn bên ngoài. Vui lòng thử lại.');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length === 0 || vectorB.length === 0) {
      throw new BadRequestException(
        'Không nhận diện được khuôn mặt từ ảnh. Vui lòng thử lại hoặc đổi ảnh khác.',
      );
    }
    if (vectorA.length !== vectorB.length) {
      throw new BadRequestException('Không thể so khớp khuôn mặt. Vui lòng thử lại.');
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
      throw new BadRequestException(
        'Không nhận diện được khuôn mặt từ ảnh. Vui lòng thử lại hoặc đổi ảnh khác.',
      );
    }

    const sanitized = vector.map((value) => {
      if (!Number.isFinite(value)) {
        throw new BadRequestException('Ảnh khuôn mặt không hợp lệ. Vui lòng thử lại với ảnh khác.');
      }
      return Number(value);
    });

    const norm = this.calculateNorm(sanitized);
    if (norm === 0) {
      throw new BadRequestException(
        'Không nhận diện được khuôn mặt từ ảnh. Vui lòng thử lại hoặc đổi ảnh khác.',
      );
    }

    return sanitized.map((value) => value / norm);
  }

  calculateNorm(vector: number[]): number {
    return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  }

  private validateImageInput(imageDataUrl: string) {
    if (!imageDataUrl || typeof imageDataUrl !== 'string') {
      throw new BadRequestException('Vui lòng chọn hoặc tải lên ảnh khuôn mặt.');
    }
    if (!imageDataUrl.startsWith('data:image/')) {
      throw new BadRequestException('Ảnh khuôn mặt không đúng định dạng. Vui lòng chọn lại ảnh.');
    }
  }

  private async extractFromEmbeddingService(imageDataUrl: string): Promise<FaceEmbeddingResult> {
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
      this.logger.error('Không kết nối được dịch vụ nhận diện khuôn mặt', error as Error);
      throw new InternalServerErrorException(
        'Dịch vụ nhận diện khuôn mặt đang bận hoặc không khả dụng. Vui lòng thử lại sau.',
      );
    }
    if (!response.ok) {
      const payload = await response.text();
      this.logger.error(`Face embedding service trả lỗi ${response.status}: ${payload}`);

      // Try to parse JSON payload to extract useful error fields
      let parsed: any = null;
      try {
        parsed = JSON.parse(payload);
      } catch {
        parsed = null;
      }

      if (response.status === 422) {
        const message =
          (parsed && (parsed.detail || parsed.message || parsed.error)) || payload || 'Không nhận diện được khuôn mặt từ ảnh.';
        throw new UnprocessableEntityException(message);
      }

      throw new InternalServerErrorException(
        'Dịch vụ nhận diện khuôn mặt đang bận hoặc không khả dụng. Vui lòng thử lại sau.',
      );
    }

    const result = (await response.json()) as FaceEmbeddingServiceResponse;

    if (!Array.isArray(result.embedding) || result.embedding.length === 0) {
      throw new InternalServerErrorException(
        'Không nhận diện được khuôn mặt từ ảnh. Vui lòng thử lại hoặc đổi ảnh khác.',
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
