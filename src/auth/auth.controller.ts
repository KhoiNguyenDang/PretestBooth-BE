import {
  Body,
  Controller,
  Post,
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
import type { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyEmailSchema } from './dto/verify-email.dto';
import type { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResendVerificationSchema } from './dto/resend-verification.dto';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(RegisterSchema))
    dto: RegisterDto,
  ) {
    return this.authService.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body(new ZodValidationPipe(LoginSchema))
    dto: LoginDto,
  ) {
    return this.authService.login(dto.email, dto.password);
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
}
