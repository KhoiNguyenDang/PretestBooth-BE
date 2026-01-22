import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ZodValidationPipe } from '../common/zod/zod-validation.pipe';
import {
  RegisterSchema,
  LoginSchema,
} from '../common/zod/auth.schema';

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
  login(
    @Body(new ZodValidationPipe(LoginSchema))
    dto: LoginDto,
  ) {
    return this.authService.login(dto.email, dto.password);
  }
}
