import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { QuestionsModule } from '../questions/questions.module';

@Module({
  imports: [PrismaModule, BookingsModule, QuestionsModule],
  providers: [TasksService],
})
export class TasksModule {}
