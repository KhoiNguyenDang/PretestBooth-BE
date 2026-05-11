import { Module } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExecutionModule } from '../execution/execution.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PointsModule } from '../points/points.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GeminiShortAnswerGraderService } from '../common/ai/gemini-short-answer-grader.service';
import { MailModule } from '../mail/mail.module';
import { LecturersModule } from '../lecturers/lecturers.module';

@Module({
  imports: [
    PrismaModule,
    ExecutionModule,
    SubmissionsModule,
    BookingsModule,
    PointsModule,
    AuthorizationModule,
    RealtimeModule,
    MailModule,
    LecturersModule,
  ],
  controllers: [ExamsController],
  providers: [ExamsService, GeminiShortAnswerGraderService],
  exports: [ExamsService],
})
export class ExamsModule {}
