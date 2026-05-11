import { IsString, IsISO8601, IsOptional, IsNumber, MinLength } from 'class-validator';

export class CreateStudentDTO {
  @IsString()
  userId: string;

  @IsString()
  @MinLength(1)
  studentCode: string;

  @IsString()
  className: string;

  @IsISO8601()
  dateOfBirth: Date | string;

  @IsOptional()
  @IsString()
  studentCardImageUrl?: string;

  @IsOptional()
  @IsNumber()
  studentCardFaceMatchScore?: number;
}

export class UpdateStudentDTO {
  @IsOptional()
  @IsString()
  className?: string;

  @IsOptional()
  @IsString()
  studentCardImageUrl?: string;

  @IsOptional()
  @IsNumber()
  studentCardFaceMatchScore?: number;

  @IsOptional()
  @IsISO8601()
  studentCardVerifiedAt?: Date | string;
}

export class StudentProfileDTO {
  id: string;
  userId: string;
  studentCode: string;
  className: string;
  dateOfBirth: Date;
  studentCardImageUrl?: string;
  studentCardVerifiedAt?: Date;
  studentCardFaceMatchScore?: number;
  createdAt: Date;
  updatedAt: Date;
}

export class StudentIdentityDTO {
  id: string;
  userId: string;
  studentCode: string;
}
