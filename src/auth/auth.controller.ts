import {
  Body,
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import type { RegisterDto } from './dto/register.dto';
import { RegisterSchema } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import { LoginSchema } from './dto/login.dto';
import { RefreshSchema, type RefreshDto } from './dto/refresh.dto';
import type { BoothLoginDto } from './dto/booth-login.dto';
import { BoothLoginSchema } from './dto/booth-login.dto';
import type { BoothLogoutDto } from './dto/booth-logout.dto';
import { BoothLogoutSchema } from './dto/booth-logout.dto';
import type { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyEmailSchema } from './dto/verify-email.dto';
import type { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResendVerificationSchema } from './dto/resend-verification.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ForgotPasswordSchema } from './dto/forgot-password.dto';
import type { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordSchema } from './dto/reset-password.dto';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import type { ActivateBoothDto } from '../booths/dto/booth.dto';
import { ActivateBoothSchema } from '../booths/dto/booth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(RegisterSchema))
    dto: RegisterDto,
  ) {
    return this.authService.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(LoginSchema))
    dto: LoginDto,
  ) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('booth-activate')
  @HttpCode(HttpStatus.OK)
  boothActivate(
    @Body(new ZodValidationPipe(ActivateBoothSchema))
    dto: ActivateBoothDto,
  ) {
    return this.authService.activateBooth(dto.boothCode, dto.otp);
  }

  @Post('booth-login')
  @HttpCode(HttpStatus.OK)
  boothLogin(
    @Body(new ZodValidationPipe(BoothLoginSchema))
    dto: BoothLoginDto,
  ) {
    return this.authService.boothLogin(dto.email, dto.password, dto.boothSessionToken);
  }

  @Post('booth-logout')
  @HttpCode(HttpStatus.OK)
  boothLogout(
    @Body(new ZodValidationPipe(BoothLogoutSchema))
    dto: BoothLogoutDto,
  ) {
    return this.authService.boothLogout(dto.boothSessionToken);
  }

  @Get('booth-session')
  @HttpCode(HttpStatus.OK)
  boothSessionStatus(@Query('boothSessionToken') boothSessionToken: string) {
    return this.authService.getBoothSessionStatus(boothSessionToken);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body(new ZodValidationPipe(RefreshSchema))
    dto: RefreshDto,
  ) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req) {
    const userId = req.user['sub'];
    return this.authService.logout(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMe(@Req() req) {
    const userId = req.user['sub'];
    return this.authService.getUser(userId);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema))
    dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(
    @Body(new ZodValidationPipe(ResendVerificationSchema))
    dto: ResendVerificationDto,
  ) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body(new ZodValidationPipe(ForgotPasswordSchema))
    dto: ForgotPasswordDto,
  ) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodValidationPipe(ResetPasswordSchema))
    dto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }
}
