import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestionReviewService } from './question-review.service';
import { QuestionReviewController } from './question-review.controller';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';
import { LecturersModule } from '../lecturers/lecturers.module';

@Module({
  imports: [PrismaModule, AuthorizationModule, CloudinaryModule, LecturersModule],
  controllers: [QuestionsController, QuestionReviewController],
  providers: [QuestionsService, QuestionReviewService],
  exports: [QuestionsService, QuestionReviewService],
})
export class QuestionsModule {}
