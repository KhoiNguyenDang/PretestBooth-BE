import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { BoothsModule } from '../booths/booths.module';
import { BookingsModule } from '../bookings/bookings.module';
import { AuthorizationModule } from '../common/authorization/authorization.module';
import { StudentsModule } from '../students/students.module';
import { LecturersModule } from '../lecturers/lecturers.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({}),
    MailModule,
    BoothsModule,
    BookingsModule,
    AuthorizationModule,
    StudentsModule,
    LecturersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
