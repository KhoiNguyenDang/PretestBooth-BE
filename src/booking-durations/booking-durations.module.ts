import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingDurationsController } from './booking-durations.controller';
import { BookingDurationsService } from './booking-durations.service';

@Module({
  imports: [PrismaModule],
  controllers: [BookingDurationsController],
  providers: [BookingDurationsService],
  exports: [BookingDurationsService],
})
export class BookingDurationsModule {}
