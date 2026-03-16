import { Module } from '@nestjs/common';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [PrismaModule, BookingsModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
