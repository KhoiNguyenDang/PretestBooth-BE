import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StudentService } from './students.service';

@Module({
  imports: [PrismaModule],
  providers: [StudentService],
  exports: [StudentService]
})
export class StudentsModule {}
