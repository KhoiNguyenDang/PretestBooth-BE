import { IsString, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class CreateLecturerDTO {
  @IsString()
  userId!: string;

  @IsString()
  lecturerRoleId!: string;

  @IsOptional()
  @IsString()
  lecturerRoleAssignedByUserId?: string;
}

export class UpdateLecturerDTO {
  @IsOptional()
  @IsString()
  lecturerRoleId?: string;
}

export class LecturerProfileDTO {
  id!: string;
  userId!: string;
  lecturerRoleId!: string;
  lecturerRoleAssignedAt!: Date;
  lecturerRoleAssignedByUserId?: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export class LecturerIdentityDTO {
  id!: string;
  userId!: string;
  lecturerRoleId!: string;
}
