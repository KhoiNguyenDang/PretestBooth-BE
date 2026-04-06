import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BoothsModule } from '../booths/booths.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PointsModule } from '../points/points.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { BoothPoliciesModule } from '../booth-policies/booth-policies.module';

@Module({
  imports: [
    PrismaModule,
    BoothsModule,
    RealtimeModule,
    PointsModule,
    AuthorizationModule,
    BoothPoliciesModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
