import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [PrismaModule, BookingsModule],
  providers: [TasksService],
})
export class TasksModule {}
