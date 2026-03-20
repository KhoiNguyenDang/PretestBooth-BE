import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProblemsModule } from './problems/problems.module';
import { ExecutionModule } from './execution/execution.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { BoothsModule } from './booths/booths.module';
import { BookingsModule } from './bookings/bookings.module';
import { PointsModule } from './points/points.module';
import { UsersModule } from './users/users.module';
import { PracticeModule } from './practice/practice.module';
import { ProctoringModule } from './proctoring/proctoring.module';
import { TasksModule } from './tasks/tasks.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BookingDurationsModule } from './booking-durations/booking-durations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    ProblemsModule,
    ExecutionModule,
    SubmissionsModule,
    QuestionsModule,
    ExamsModule,
    BoothsModule,
    BookingsModule,
    PointsModule,
    UsersModule,
    PracticeModule,
    ProctoringModule,
    TasksModule,
    DashboardModule,
    BookingDurationsModule,
  ],
})
export class AppModule {}
