import { Module } from '@nestjs/common';
import { BoothPoliciesModule } from '../booth-policies/booth-policies.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { FaceModule } from '../face/face.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';

@Module({
  imports: [PrismaModule, FaceModule, RealtimeModule, BoothPoliciesModule, CloudinaryModule],
  controllers: [CheckinController],
  providers: [CheckinService],
  exports: [CheckinService],
})
export class CheckinModule {}
