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
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { UserResponseDto, TokenResponseDto, LogoutResponseDto } from './dto/auth-response.dto';
import * as crypto from 'crypto';
import { BoothsService } from '../booths/booths.service';
import { BookingsService } from '../bookings/bookings.service';
import { AuthorizationService } from '../common/authorization/authorization.service';
import { StudentService } from '../students/students.service';
import { LecturerService } from '../lecturers/lecturers.service';

type BoothAccessMode = 'SCHEDULED' | 'WALK_IN';

interface TokenBoothContext {
  isActivatedBoothContext?: boolean;
  boothAccessMode?: BoothAccessMode;
  boothId?: string;
}

interface BoothSessionBindingContext {
  boothClientId: string;
  userAgent?: string | null;
}

const NO_PENDING_BOOKING_MESSAGE = 'Không có booking hợp lệ theo booth và khung giờ để check-in';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly boothsService: BoothsService,
    private readonly bookingsService: BookingsService,
    private readonly authorizationService: AuthorizationService,
    private readonly studentService: StudentService,
    private readonly lecturerService: LecturerService,
  ) {}

  private async resolveRoleIdentity(userId: string, role: string) {
    if (role === 'STUDENT') {
      const student = await this.studentService.getStudentByUserId(userId);
      return { studentId: student?.id ?? null, lecturerId: null };
    }

    if (role === 'LECTURER') {
      const lecturer = await this.lecturerService.getLecturerByUserId(userId);
      return { studentId: null, lecturerId: lecturer?.id ?? null };
    }

    return { studentId: null, lecturerId: null };
  }

  private async buildUserResponse(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isEmailVerified?: boolean;
    kycStatus?: string;
    studentId?: string | null;
    lecturerId?: string | null;
  }) {
    const permissions = await this.authorizationService.getPermissionsForUser(user.id, user.role);

    let isEmailVerified = user.isEmailVerified;
    let kycStatus = user.kycStatus;

    if (isEmailVerified === undefined || kycStatus === undefined) {
      const [auth, kyc] = await Promise.all([
        isEmailVerified === undefined
          ? this.prisma.userAuth.findUnique({
              where: { userId: user.id },
              select: { isEmailVerified: true },
            })
          : null,
        kycStatus === undefined
          ? this.prisma.userKyc.findUnique({
              where: { userId: user.id },
              select: { kycStatus: true },
            })
          : null,
      ]);
      if (isEmailVerified === undefined) isEmailVerified = auth?.isEmailVerified ?? false;
      if (kycStatus === undefined) kycStatus = kyc?.kycStatus ?? 'NOT_STARTED';
    }

    return new UserResponseDto({
      id: user.id,
      studentId: user.studentId || undefined,
      lecturerId: user.lecturerId || undefined,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
      permissions,
      isEmailVerified: isEmailVerified,
      kycStatus: kycStatus as any,
    });
  }

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
        studentCode,
      },
    });

    await Promise.all([
      this.prisma.userAuth.create({
        data: {
          userId: user.id,
          password: hashedPassword,
          isEmailVerified: false,
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationExpiry,
        },
      }),
      this.prisma.userProfile.create({
        data: {
          userId: user.id,
          name: name || null,
          studentCode,
        },
      }),
      this.prisma.pointAccount.create({
        data: {
          userId: user.id,
        },
      }),
    ]);

    // Send verification email
    await this.mailService.sendVerificationEmail(email, verificationToken);

    return this.buildUserResponse(user);
  }

  private async generateTokens(
    userId: string,
    role: string,
    boothContext?: TokenBoothContext,
    roleIdentity?: { studentId?: string | null; lecturerId?: string | null },
  ) {
    const payload = {
      sub: userId,
      role,
      studentId: roleIdentity?.studentId || null,
      lecturerId: roleIdentity?.lecturerId || null,
      isActivatedBoothContext: boothContext?.isActivatedBoothContext || false,
      boothAccessMode: boothContext?.boothAccessMode || null,
      boothId: boothContext?.boothId || null,
    };

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
    const roleIdentity = await this.resolveRoleIdentity(user.id, user.role);

    const tokens = await this.generateTokens(user.id, user.role, undefined, roleIdentity);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.userAuth.update({
      where: { userId: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return new TokenResponseDto({
      ...tokens,
      user: await this.buildUserResponse({ ...user, ...roleIdentity }),
    });
  }

  async activateBooth(boothCode: string, otp: string, boothBinding: BoothSessionBindingContext) {
    return this.boothsService.activateBoothSession(boothCode, otp, boothBinding);
  }

  async boothLogin(
    email: string,
    password: string,
    boothSessionToken: string,
    boothBinding: BoothSessionBindingContext,
  ) {
    const user = await this.validateUserCredentials(email, password);
    const roleIdentity = await this.resolveRoleIdentity(user.id, user.role);

    if (user.role !== 'STUDENT') {
      throw new ForbiddenException('Booth login chỉ áp dụng cho sinh viên');
    }

    const booth = await this.boothsService.validateBoothSessionToken(
      boothSessionToken,
      boothBinding,
    );
    let accessMode: BoothAccessMode = 'SCHEDULED';
    let checkedInBooking: any = null;
    let pendingCheckinBooking: any = null;
    let walkInProtection: {
      nextExamStartTime: string | null;
      warnAt: string | null;
      forceLogoutAt: string | null;
      noShowGraceUntil: string | null;
    } | null = null;

    try {
      const bookingForCheckin = await this.bookingsService.getPendingCheckInByBooth(
        user.id,
        booth.id,
      );
      const bookingForFreshCheckin = await this.prisma.booking.update({
        where: { id: bookingForCheckin.id },
        data: {
          status: 'CONFIRM',
          checkedInAt: null,
          checkinStatus: 'PENDING',
          checkinSimilarityScore: null,
          checkinVerifiedAt: null,
        },
      });

      pendingCheckinBooking = bookingForFreshCheckin;
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      if (!message.includes(NO_PENDING_BOOKING_MESSAGE)) {
        throw error;
      }

      const walkInResult = await this.bookingsService.createWalkInPracticeForBoothLogin(
        user.id,
        booth.id,
      );
      accessMode = 'WALK_IN';
      checkedInBooking = walkInResult.booking;
      walkInProtection = walkInResult.protection;
    }

    const tokens = await this.generateTokens(
      user.id,
      user.role,
      {
        isActivatedBoothContext: true,
        boothAccessMode: accessMode,
        boothId: booth.id,
      },
      roleIdentity,
    );
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.userAuth.update({
      where: { userId: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      ...new TokenResponseDto({
        ...tokens,
        user: await this.buildUserResponse({ ...user, ...roleIdentity }),
      }),
      booth: {
        id: booth.id,
        code: booth.code || booth.name,
        name: booth.name,
      },
      accessMode,
      checkedInBooking,
      pendingCheckinBooking,
      walkInProtection,
    };
  }

  async boothLogout(
    boothSessionToken: string,
    role?: string,
    userId?: string,
    boothBinding?: BoothSessionBindingContext,
  ) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Chỉ ADMIN mới được phép đăng xuất booth');
    }

    if (!boothBinding) {
      throw new BadRequestException('Thiếu ngữ cảnh phiên kiosk');
    }

    return this.boothsService.deactivateBoothSession(boothSessionToken, boothBinding, userId);
  }

  async getBoothSessionStatus(boothSessionToken: string, boothBinding: BoothSessionBindingContext) {
    return this.boothsService.getBoothSessionStatus(boothSessionToken, boothBinding);
  }

  private async validateUserCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { auth: true },
    });

    if (!user || !user.auth) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    if (user.auth.isLocked) {
      throw new ForbiddenException('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.');
    }

    if (user.role === 'STUDENT' && user.studentCode) {
      const enrollmentYear = 2000 + parseInt(user.studentCode.substring(0, 2), 10);
      const currentYear = new Date().getFullYear();
      if (currentYear - enrollmentYear >= 6) {
        await this.prisma.userAuth.update({
          where: { userId: user.id },
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

    const isValid = await bcrypt.compare(password, user.auth.password);
    if (!isValid) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }

    if (!user.auth.isEmailVerified) {
      throw new ForbiddenException('Vui lòng xác thực email trước khi đăng nhập');
    }

    return user;
  }

  async refresh(refreshToken: string) {
    let userId: string;
    let boothContext: TokenBoothContext | undefined;
    let roleIdentity: { studentId?: string | null; lecturerId?: string | null } | undefined;

    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      userId = payload.sub;
      roleIdentity = {
        studentId: payload?.studentId || null,
        lecturerId: payload?.lecturerId || null,
      };
      boothContext = payload?.isActivatedBoothContext
        ? {
            isActivatedBoothContext: true,
            boothAccessMode: payload?.boothAccessMode || null,
            boothId: payload?.boothId || null,
          }
        : undefined;
    } catch (error) {
      throw new ForbiddenException('Access denied');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { auth: true },
    });

    if (!user || !user.auth?.refreshToken) {
      throw new ForbiddenException('Access denied');
    }

    const isValid = await bcrypt.compare(refreshToken, user.auth.refreshToken);

    if (!isValid) {
      throw new ForbiddenException('Access denied');
    }

    if (!roleIdentity?.studentId && user.role === 'STUDENT') {
      roleIdentity = await this.resolveRoleIdentity(user.id, user.role);
    }

    if (!roleIdentity?.lecturerId && user.role === 'LECTURER') {
      roleIdentity = await this.resolveRoleIdentity(user.id, user.role);
    }

    const tokens = await this.generateTokens(user.id, user.role, boothContext, roleIdentity);
    const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);

    await this.prisma.userAuth.update({
      where: { userId: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return new TokenResponseDto(tokens);
  }

  async logout(userId: string) {
    await this.prisma.userAuth.update({
      where: { userId },
      data: { refreshToken: null },
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

    const roleIdentity = await this.resolveRoleIdentity(user.id, user.role);

    return this.buildUserResponse({ ...user, ...roleIdentity });
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new BadRequestException('Email không được tìm thấy');
    }

    const resetCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const hashedCode = await bcrypt.hash(resetCode, 10);

    await this.prisma.userAuth.update({
      where: { userId: user.id },
      data: {
        resetPasswordCode: hashedCode,
        resetPasswordExpiry: expiresAt,
      },
    });

    await this.mailService.sendPasswordResetEmail(email, resetCode);

    return { message: 'Mã đặt lại mật khẩu đã được gửi tới email của bạn' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { auth: true },
    });

    if (!user || !user.auth?.resetPasswordCode || !user.auth?.resetPasswordExpiry) {
      throw new BadRequestException('Yêu cầu đặt lại mật khẩu không hợp lệ');
    }

    if (user.auth.resetPasswordExpiry < new Date()) {
      throw new BadRequestException('Mã đặt lại mật khẩu đã hết hạn');
    }

    const isValidCode = await bcrypt.compare(code, user.auth.resetPasswordCode);

    if (!isValidCode) {
      throw new BadRequestException('Mã xác nhận không hợp lệ');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.userAuth.update({
      where: { userId: user.id },
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
    const auth = await this.prisma.userAuth.findFirst({
      where: {
        emailVerificationToken: token,
      },
      include: { user: true },
    });

    if (!auth) {
      throw new BadRequestException('Liên kết xác thực không hợp lệ');
    }

    // Check if token is expired
    if (auth.emailVerificationExpiry && auth.emailVerificationExpiry < new Date()) {
      throw new BadRequestException('Liên kết xác thực đã hết hạn');
    }

    // Mark email as verified
    await this.prisma.userAuth.update({
      where: { userId: auth.userId },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    return this.buildUserResponse({
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      isEmailVerified: true,
      ...(await this.resolveRoleIdentity(auth.user.id, auth.user.role)),
    });
  }

  async resendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { auth: true },
    });

    if (!user) {
      throw new BadRequestException('Email không được tìm thấy');
    }

    if (user.auth?.isEmailVerified) {
      throw new BadRequestException('Email đã được xác thực');
    }

    // Generate new verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.userAuth.upsert({
      where: { userId: user.id },
      update: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationExpiry,
      },
      create: {
        userId: user.id,
        password: '',
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
