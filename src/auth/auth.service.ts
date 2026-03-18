import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserResponseDto, TokenResponseDto, LogoutResponseDto } from './dto/auth-response.dto';
import * as crypto from 'crypto';
import { BoothsService } from '../booths/booths.service';
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly boothsService: BoothsService,
    private readonly bookingsService: BookingsService,
  ) {}

  async register(email: string, password: string, name?: string) {
    // Validate school email format and extract student code
    const schoolEmailPattern = /^(\d{8})\.[a-z]+@(student|teacher)\.iuh\.edu\.vn$/;
    const match = email.match(schoolEmailPattern);

    if (!match) {
      throw new BadRequestException(
        'Vui lòng sử dụng email trường (XXXXXXXX.yourname@(student|teacher).iuh.edu.vn)',
      );
    }

    const studentCode = match[1];

    const exists = await this.prisma.user.findUnique({
      where: { email },
    });

    if (exists) {
      throw new ConflictException('Email đã tồn tại');
    }

    // Check if student code is already registered
    const studentCodeExists = await this.prisma.user.findUnique({
      where: { studentCode },
    });

    if (studentCodeExists) {
      throw new ConflictException('Mã sinh viên này đã được đăng ký');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await this.prisma.user.create({
      data: {
        email,
        name: name || null,
        password: hashedPassword,
        studentCode,
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    // Send verification email
    await this.mailService.sendVerificationEmail(email, verificationToken);

    return new UserResponseDto({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private async generateTokens(userId: string, role: string) {
    const payload = { sub: userId, role };

    const accessToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '90m',
    });

    return new TokenResponseDto({
      accessToken,
      refreshToken,
    });
  }

  async login(email: string, password: string) {
    const user = await this.validateUserCredentials(email, password);

    const tokens = await this.generateTokens(user.id, user.role);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(tokens.refreshToken, 10),
      },
    });

    return new TokenResponseDto({
      ...tokens,
      user: new UserResponseDto({
        id: user.id,
        email: user.email,
        name: user.name || undefined,
        role: user.role,
      }),
    });
  }

  async activateBooth(boothCode: string, otp: string) {
    return this.boothsService.activateBoothSession(boothCode, otp);
  }

  async boothLogin(email: string, password: string, boothSessionToken: string) {
    const user = await this.validateUserCredentials(email, password);

    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('Booth login chỉ áp dụng cho sinh viên');
    }

    const booth = await this.boothsService.validateBoothSessionToken(boothSessionToken);
    const checkedInBooking = await this.bookingsService.autoCheckInByBooth(user.id, booth.id);

    const tokens = await this.generateTokens(user.id, user.role);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(tokens.refreshToken, 10),
      },
    });

    return {
      ...new TokenResponseDto({
        ...tokens,
        user: new UserResponseDto({
          id: user.id,
          email: user.email,
          name: user.name || undefined,
          role: user.role,
        }),
      }),
      booth: {
        id: booth.id,
        code: booth.code || booth.name,
        name: booth.name,
      },
      checkedInBooking,
    };
  }

  async boothLogout(boothSessionToken: string, role?: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ ADMIN mới được phép đăng xuất booth');
    }

    return this.boothsService.deactivateBoothSession(boothSessionToken);
  }

  async getBoothSessionStatus(boothSessionToken: string) {
    return this.boothsService.getBoothSessionStatus(boothSessionToken);
  }

  private async validateUserCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    if (user.isLocked) {
      throw new ForbiddenException('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }

    if (user.role === 'STUDENT' && user.studentCode) {
      const enrollmentYear = 2000 + parseInt(user.studentCode.substring(0, 2), 10);
      const currentYear = new Date().getFullYear();
      if (currentYear - enrollmentYear >= 6) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isLocked: true,
            lockedAt: new Date(),
            lockedReason: `Tài khoản tự động khóa: sinh viên khóa ${enrollmentYear} đã quá 6 năm`,
          },
        });
        throw new ForbiddenException(
          `Tài khoản đã bị khóa tự động. Sinh viên khóa ${enrollmentYear} đã quá thời hạn 6 năm sử dụng hệ thống.`,
        );
      }
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Vui lòng xác thực email trước khi đăng nhập');
    }

    return user;
  }

  async refresh(refreshToken: string) {
    let userId: string;

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      userId = payload.sub;
    } catch (error) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Access denied');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!isValid) {
      throw new ForbiddenException('Access denied');
    }

    const tokens = await this.generateTokens(user.id, user.role);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(tokens.refreshToken, 10),
      },
    });

    return new TokenResponseDto(tokens);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
      },
    });

    return new LogoutResponseDto({ message: 'Đăng xuất thành công' });
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    return new UserResponseDto({
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
    });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new BadRequestException('Email không được tìm thấy');
    }

    const resetCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const hashedCode = await bcrypt.hash(resetCode, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordCode: hashedCode,
        resetPasswordExpiry: expiresAt,
      },
    });

    await this.mailService.sendPasswordResetEmail(email, resetCode);

    return { message: 'Mã đặt lại mật khẩu đã được gửi tới email của bạn' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.resetPasswordCode || !user.resetPasswordExpiry) {
      throw new BadRequestException('Yêu cầu đặt lại mật khẩu không hợp lệ');
    }

    if (user.resetPasswordExpiry < new Date()) {
      throw new BadRequestException('Mã đặt lại mật khẩu đã hết hạn');
    }

    const isValidCode = await bcrypt.compare(code, user.resetPasswordCode);

    if (!isValidCode) {
      throw new BadRequestException('Mã xác nhận không hợp lệ');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordCode: null,
        resetPasswordExpiry: null,
        refreshToken: null,
      },
    });

    return { message: 'Đặt lại mật khẩu thành công' };
  }

  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
      },
    });

    if (!user) {
      throw new BadRequestException('Liên kết xác thực không hợp lệ');
    }

    // Check if token is expired
    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Liên kết xác thực đã hết hạn');
    }

    // Mark email as verified
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    return new UserResponseDto({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Email không được tìm thấy');
    }

    if (user.isEmailVerified) {
      throw new BadRequestException('Email đã được xác thực');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
    });

    // Send verification email
    await this.mailService.sendVerificationEmail(email, verificationToken);

    return {
      message: 'Đã gửi lại email xác thực. Vui lòng kiểm tra email của bạn.',
    };
  }
}
