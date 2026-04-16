import { Module } from '@nestjs/common';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PointsModule } from '../points/points.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GeminiShortAnswerGraderService } from '../common/ai/gemini-short-answer-grader.service';
import { SubmissionsModule } from '../submissions/submissions.module';

@Module({
  imports: [
    PrismaModule,
    BookingsModule,
    PointsModule,
    AuthorizationModule,
    RealtimeModule,
    SubmissionsModule,
  ],
  controllers: [PracticeController],
  providers: [PracticeService, GeminiShortAnswerGraderService],
  exports: [PracticeService],
})
export class PracticeModule {}
