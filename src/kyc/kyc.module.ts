import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { FaceModule } from '../face/face.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [PrismaModule, FaceModule, CloudinaryModule, AuthorizationModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
