export const LECTURER_PERMISSION_KEYS = [
  'CREATE_EXAM',
  'REVIEW_QUESTION',
  'MANAGE_QUESTION_BANK',
  'MANAGE_STUDENTS',
  'MANAGE_BOOTHS',
  'LECTURER_ADMIN',
] as const;

export type LecturerPermissionKey = (typeof LECTURER_PERMISSION_KEYS)[number];

export const LECTURER_ADMIN_PERMISSION: LecturerPermissionKey = 'LECTURER_ADMIN';

export const LOWER_LECTURER_PERMISSIONS = LECTURER_PERMISSION_KEYS.filter(
  (permission) => permission !== LECTURER_ADMIN_PERMISSION,
) as LecturerPermissionKey[];
