import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { QuestionsModule } from '../questions/questions.module';
import { ExamsModule } from '../exams/exams.module';
import { PracticeModule } from '../practice/practice.module';

@Module({
  imports: [PrismaModule, BookingsModule, QuestionsModule, ExamsModule, PracticeModule],
  providers: [TasksService],
})
export class TasksModule {}
