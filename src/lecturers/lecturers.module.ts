import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LecturerService } from './lecturers.service';

@Module({
  imports: [PrismaModule],
  providers: [LecturerService],
  exports: [LecturerService]
})
export class LecturersModule {}
