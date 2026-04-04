import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BoothsModule } from '../booths/booths.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PointsModule } from '../points/points.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';

@Module({
  imports: [PrismaModule, BoothsModule, RealtimeModule, PointsModule, AuthorizationModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
