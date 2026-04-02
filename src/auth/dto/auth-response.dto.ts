import { Exclude, Expose } from 'class-transformer';

// DTO cho User
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  name?: string;

  @Expose()
  role: string;

  @Expose()
  permissions?: string[];

  @Expose()
  isEmailVerified?: boolean;

  @Expose()
  kycStatus?: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}

// DTO cho Token
export class TokenResponseDto {
  @Expose()
  accessToken: string;

  @Expose()
  refreshToken: string;

  @Expose()
  user?: UserResponseDto;

  constructor(partial: Partial<TokenResponseDto>) {
    Object.assign(this, partial);
  }
}

// DTO logout response
export class LogoutResponseDto {
  @Expose()
  message: string;
  constructor(partial: Partial<LogoutResponseDto>) {
    Object.assign(this, partial);
  }
}
