import { z } from 'zod';
import { LECTURER_PERMISSION_KEYS } from '../../common/authorization/authorization.constants';

export const QueryUserSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(10),
  role: z.enum(['STUDENT', 'LECTURER', 'ADMIN']).optional(),
  search: z.string().optional(),
  className: z.string().optional(),
  isLocked: z.preprocess((val) => val === 'true' ? true : val === 'false' ? false : undefined, z.boolean().optional()),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  format: z.enum(['csv', 'xlsx']).optional(),
});

export type QueryUserDto = z.output<typeof QueryUserSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  name: z.string().min(1, 'Tên không được để trống'),
  role: z.enum(['STUDENT', 'LECTURER', 'ADMIN']),
  studentCode: z.string().optional(),
  className: z.string().optional(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Ngày sinh không hợp lệ').optional(),
});

export type CreateUserDto = z.output<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  email: z.string().email('Email không hợp lệ').optional(),
  studentCode: z.string().optional(),
  name: z.string().min(1).optional(),
  className: z.string().optional(),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), 'Ngày sinh không hợp lệ').optional(),
  isLocked: z.boolean().optional(),
  lockedReason: z.string().optional(),
});

export type UpdateUserDto = z.output<typeof UpdateUserSchema>;

export const LecturerPermissionSchema = z.enum(LECTURER_PERMISSION_KEYS);
export type LecturerPermissionDto = z.output<typeof LecturerPermissionSchema>;

export const QueryLecturerSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type QueryLecturerDto = z.output<typeof QueryLecturerSchema>;

export const UpdateLecturerPermissionsSchema = z.object({
  permissions: z.array(LecturerPermissionSchema).max(LECTURER_PERMISSION_KEYS.length),
});

export type UpdateLecturerPermissionsDto = z.output<typeof UpdateLecturerPermissionsSchema>;
