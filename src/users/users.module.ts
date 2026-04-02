import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, AuthorizationModule, MailModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
