import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { MailModule } from '../mail/mail.module';
import { StudentsModule } from '../students/students.module';
import { LecturersModule } from '../lecturers/lecturers.module';

@Module({
  imports: [PrismaModule, AuthorizationModule, MailModule, StudentsModule, LecturersModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
