import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiOptions } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly folder: string;
  private readonly kycCardFolder: string;
  private readonly checkinEvidenceFolder: string;
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

    this.kycCardFolder = this.configService.get<string>(
      'CLOUDINARY_KYC_CARD_IMAGE_FOLDER',
      'pretestbooth/kyc-cards',
    );

    this.checkinEvidenceFolder = this.configService.get<string>(
      'CLOUDINARY_CHECKIN_EVIDENCE_FOLDER',
      'pretestbooth/checkin-evidence',
    );
  }

  async uploadQuestionImage(file: { mimetype: string; buffer: Buffer }): Promise<string> {
    const mimeType = file.mimetype || 'application/octet-stream';
    const base64 = file.buffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    return this.uploadDataUrl(dataUri, this.folder);
  }

  async uploadKycStudentCardImage(imageDataUrl: string): Promise<string> {
    return this.uploadDataUrl(imageDataUrl, this.kycCardFolder);
  }

  async uploadCheckinEvidenceImage(imageDataUrl: string): Promise<string> {
    return this.uploadDataUrl(imageDataUrl, this.checkinEvidenceFolder);
  }

  private async uploadDataUrl(dataUrl: string, folder: string): Promise<string> {
    if (!this.isConfigured) {
      throw new InternalServerErrorException(
        'Thiếu cấu hình Cloudinary. Vui lòng cấu hình CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET',
      );
    }

    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new InternalServerErrorException('Du lieu anh khong hop le de tai len Cloudinary');
    }

    const options: UploadApiOptions = {
      folder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    };

    const result = await cloudinary.uploader.upload(dataUrl, options);
    return result.secure_url;
  }
}
