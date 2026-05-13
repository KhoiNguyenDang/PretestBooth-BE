import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { BoothsService } from '../booths/booths.service';
import { BookingsService } from '../bookings/bookings.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { StudentService } from '../students/students.service';
import { LecturerService } from '../lecturers/lecturers.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: MailService, useValue: {} },
        { provide: BoothsService, useValue: {} },
        { provide: BookingsService, useValue: {} },
        { provide: AuthorizationService, useValue: {} },
        { provide: StudentService, useValue: {} },
        { provide: LecturerService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
