import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiOptions } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly folder: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.isConfigured = Boolean(cloudName && apiKey && apiSecret);

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    }

    this.folder = this.configService.get<string>(
      'CLOUDINARY_QUESTION_IMAGE_FOLDER',
      'pretestbooth/questions',
    );
  }

  async uploadQuestionImage(file: { mimetype: string; buffer: Buffer }): Promise<string> {
    if (!this.isConfigured) {
      throw new InternalServerErrorException(
        'Thiếu cấu hình Cloudinary. Vui lòng cấu hình CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
      );
    }

    const mimeType = file.mimetype || 'application/octet-stream';
    const base64 = file.buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    const options: UploadApiOptions = {
      folder: this.folder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    };

    const result = await cloudinary.uploader.upload(dataUri, options);
    return result.secure_url;
  }
}
