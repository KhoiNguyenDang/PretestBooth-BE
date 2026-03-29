import { Module } from '@nestjs/common';
import { FaceModule } from '../face/face.module';
import { PrismaModule } from '../prisma/prisma.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [PrismaModule, FaceModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
