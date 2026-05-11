import { Module } from '@nestjs/common';
import { ProblemsService } from './problems.service';
import { ProblemsController } from './problems.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LecturersModule } from '../lecturers/lecturers.module';

@Module({
  imports: [PrismaModule, LecturersModule],
  controllers: [ProblemsController],
  providers: [ProblemsService],
  exports: [ProblemsService],
})
export class ProblemsModule {}
