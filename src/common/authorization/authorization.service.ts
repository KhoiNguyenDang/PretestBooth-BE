import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LECTURER_ADMIN_PERMISSION,
  LECTURER_PERMISSION_KEYS,
  LOWER_LECTURER_PERMISSIONS,
  type LecturerPermissionKey,
} from './authorization.constants';

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  getAllLecturerPermissions(): LecturerPermissionKey[] {
    return [...LECTURER_PERMISSION_KEYS];
  }

  getLowerLecturerPermissions(): LecturerPermissionKey[] {
    return [...LOWER_LECTURER_PERMISSIONS];
  }

  async getPermissionsForUser(userId: string, role: string): Promise<LecturerPermissionKey[]> {
    if (role === 'ADMIN') {
      return this.getAllLecturerPermissions();
    }

    if (role !== 'LECTURER') {
      return [];
    }

    return this.getPermissionsForLecturer(userId);
  }

  async getPermissionsForLecturer(lecturerId: string): Promise<LecturerPermissionKey[]> {
    const rows = await this.prisma.$queryRaw<Array<{ permission: string }>>`
      SELECT "permission"::text AS permission
      FROM "LecturerPermissionAssignment"
      WHERE "lecturerId" = ${lecturerId}
      ORDER BY "permission" ASC
    `;

    return rows.map((row) => row.permission as LecturerPermissionKey);
  }

  async hasPermission(
    userId: string,
    role: string,
    permission: LecturerPermissionKey,
  ): Promise<boolean> {
    if (role === 'ADMIN') {
      return true;
    }

    if (role !== 'LECTURER') {
      return false;
    }

    const rows = await this.prisma.$queryRaw<Array<{ hasPermission: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM "LecturerPermissionAssignment"
        WHERE "lecturerId" = ${userId}
          AND "permission" = ${permission}::"LecturerPermission"
      ) AS "hasPermission"
    `;

    return Boolean(rows[0]?.hasPermission);
  }

  async assertPermission(
    userId: string,
    role: string,
    permission: LecturerPermissionKey,
    forbiddenMessage: string,
  ) {
    const allowed = await this.hasPermission(userId, role, permission);
    if (!allowed) {
      throw new ForbiddenException(forbiddenMessage);
    }
  }

  canManageLecturerPermissions(requesterRole: string, requesterPermissions: LecturerPermissionKey[]) {
    if (requesterRole === 'ADMIN') {
      return true;
    }

    return (
      requesterRole === 'LECTURER' && requesterPermissions.includes(LECTURER_ADMIN_PERMISSION)
    );
  }

  assertCanManageLecturerPermissions(requesterRole: string, requesterPermissions: LecturerPermissionKey[]) {
    if (!this.canManageLecturerPermissions(requesterRole, requesterPermissions)) {
      throw new ForbiddenException(
        'Bạn không có quyền phân quyền giảng viên. Chỉ ADMIN gốc hoặc giảng viên có quyền admin mới được thao tác.',
      );
    }
  }

  canGrantPermission(
    requesterRole: string,
    requesterPermissions: LecturerPermissionKey[],
    permission: LecturerPermissionKey,
  ) {
    if (requesterRole === 'ADMIN') {
      return true;
    }

    if (requesterRole !== 'LECTURER') {
      return false;
    }

    if (!requesterPermissions.includes(LECTURER_ADMIN_PERMISSION)) {
      return false;
    }

    return permission !== LECTURER_ADMIN_PERMISSION;
  }

  assertCanGrantPermission(
    requesterRole: string,
    requesterPermissions: LecturerPermissionKey[],
    permission: LecturerPermissionKey,
  ) {
    if (!this.canGrantPermission(requesterRole, requesterPermissions, permission)) {
      throw new ForbiddenException(
        permission === LECTURER_ADMIN_PERMISSION
          ? 'Chỉ ADMIN gốc mới được cấp quyền admin cho giảng viên.'
          : 'Bạn không có quyền cấp quyền này cho giảng viên khác.',
      );
    }
  }
}
