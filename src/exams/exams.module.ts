import { Module } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionModule } from '../execution/execution.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [PrismaModule, ExecutionModule, SubmissionsModule, BookingsModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
