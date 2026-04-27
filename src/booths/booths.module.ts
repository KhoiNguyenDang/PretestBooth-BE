import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BoothsController } from './booths.controller';
import { BoothsService } from './booths.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, JwtModule.register({}), RealtimeModule, AuthorizationModule, MailModule],
  controllers: [BoothsController],
  providers: [BoothsService],
  exports: [BoothsService],
})
export class BoothsModule {}
