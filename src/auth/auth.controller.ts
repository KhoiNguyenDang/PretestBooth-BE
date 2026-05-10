import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
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
  private static readonly REFRESH_COOKIE_NAME = 'refreshToken';

  constructor(private readonly authService: AuthService) {}

  private getRefreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSite =
      (process.env.REFRESH_COOKIE_SAMESITE as 'lax' | 'strict' | 'none' | undefined) ||
      (isProd ? 'none' : 'lax');
    const cookieDomain = process.env.REFRESH_COOKIE_DOMAIN;
    const secureOverride = process.env.REFRESH_COOKIE_SECURE;
    const secure =
      secureOverride === 'true'
        ? true
        : secureOverride === 'false'
          ? false
          : sameSite === 'none'
            ? true
            : isProd;

    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      maxAge: 90 * 60 * 1000,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie(AuthController.REFRESH_COOKIE_NAME, refreshToken, this.getRefreshCookieOptions());
  }

  private clearRefreshTokenCookie(res: Response) {
    const cookieOptions = this.getRefreshCookieOptions();
    res.clearCookie(AuthController.REFRESH_COOKIE_NAME, {
      path: cookieOptions.path,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
    });
  }

  private getRefreshTokenFromCookie(req: any): string | null {
    const cookieHeader = req?.headers?.cookie;

    if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
      return null;
    }

    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed.startsWith(`${AuthController.REFRESH_COOKIE_NAME}=`)) {
        continue;
      }

      const rawValue = trimmed.slice(AuthController.REFRESH_COOKIE_NAME.length + 1);
      return decodeURIComponent(rawValue);
    }

    return null;
  }

  private extractBoothSessionBinding(req: any) {
    const rawBoothClientId = req?.headers?.['x-booth-client-id'];
    const boothClientId = Array.isArray(rawBoothClientId) ? rawBoothClientId[0] : rawBoothClientId;

    if (typeof boothClientId !== 'string' || boothClientId.trim().length < 16) {
      throw new BadRequestException('Thiếu hoặc không hợp lệ header x-booth-client-id');
    }

    const rawUserAgent = req?.headers?.['user-agent'];
    const userAgent = Array.isArray(rawUserAgent) ? rawUserAgent[0] : rawUserAgent;

    return {
      boothClientId: boothClientId.trim(),
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    };
  }

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
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(LoginSchema))
    dto: LoginDto,
  ) {
    return this.authService.login(dto.email, dto.password).then((tokens) => {
      this.setRefreshTokenCookie(res, tokens.refreshToken);

      return {
        accessToken: tokens.accessToken,
        user: tokens.user,
      };
    });
  }

  @Post('booth-activate')
  @HttpCode(HttpStatus.OK)
  boothActivate(
    @Req() req,
    @Body(new ZodValidationPipe(ActivateBoothSchema))
    dto: ActivateBoothDto,
  ) {
    return this.authService.activateBooth(
      dto.boothCode,
      dto.otp,
      this.extractBoothSessionBinding(req),
    );
  }

  @Post('booth-login')
  @HttpCode(HttpStatus.OK)
  boothLogin(
    @Req() req,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(BoothLoginSchema))
    dto: BoothLoginDto,
  ) {
    return this.authService
      .boothLogin(
        dto.email,
        dto.password,
        dto.boothSessionToken,
        this.extractBoothSessionBinding(req),
      )
      .then((result) => {
        this.setRefreshTokenCookie(res, result.refreshToken);

        return {
          accessToken: result.accessToken,
          user: result.user,
          booth: result.booth,
          accessMode: result.accessMode,
          checkedInBooking: result.checkedInBooking,
          pendingCheckinBooking: result.pendingCheckinBooking,
          walkInProtection: result.walkInProtection,
        };
      });
  }

  @Post('booth-logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  boothLogout(
    @Req() req,
    @Body(new ZodValidationPipe(BoothLogoutSchema))
    dto: BoothLogoutDto,
  ) {
    return this.authService.boothLogout(
      dto.boothSessionToken,
      req.user?.role,
      req.user?.sub,
      this.extractBoothSessionBinding(req),
    );
  }

  @Get('booth-session')
  @HttpCode(HttpStatus.OK)
  boothSessionStatus(@Req() req, @Query('boothSessionToken') boothSessionToken: string) {
    return this.authService.getBoothSessionStatus(
      boothSessionToken,
      this.extractBoothSessionBinding(req),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Req() req,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(RefreshSchema))
    dto: RefreshDto,
  ) {
    const refreshTokenFromCookie = this.getRefreshTokenFromCookie(req);
    const refreshToken = refreshTokenFromCookie || dto.refreshToken;

    if (!refreshToken) {
      throw new BadRequestException('Thiếu refresh token');
    }

    return this.authService.refresh(refreshToken).then((tokens) => {
      this.setRefreshTokenCookie(res, tokens.refreshToken);

      return {
        accessToken: tokens.accessToken,
      };
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    this.clearRefreshTokenCookie(res);
    return { message: 'Đăng xuất thành công' };
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
