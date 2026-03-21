import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BoothsController } from './booths.controller';
import { BoothsService } from './booths.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PrismaModule, JwtModule.register({}), RealtimeModule],
  controllers: [BoothsController],
  providers: [BoothsService],
  exports: [BoothsService],
})
export class BoothsModule {}
