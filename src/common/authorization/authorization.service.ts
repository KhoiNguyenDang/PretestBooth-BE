import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LECTURER_ADMIN_PERMISSION,
  LECTURER_PERMISSION_KEYS,
  LOWER_LECTURER_PERMISSIONS,
  type LecturerPermissionKey,
} from './authorization.constants';

export interface LecturerRoleSummary {
  id: string;
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
}

export interface LecturerPermissionSnapshot {
  permissions: LecturerPermissionKey[];
  individualPermissions: LecturerPermissionKey[];
  rolePermissions: LecturerPermissionKey[];
  lecturerRole: LecturerRoleSummary | null;
}

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  private mergePermissions(
    ...permissionGroups: LecturerPermissionKey[][]
  ): LecturerPermissionKey[] {
    return Array.from(new Set(permissionGroups.flat())).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  getAllLecturerPermissions(): LecturerPermissionKey[] {
    return [...LECTURER_PERMISSION_KEYS];
  }

  getLowerLecturerPermissions(): LecturerPermissionKey[] {
    return [...LOWER_LECTURER_PERMISSIONS];
  }

  async getPermissionsForUser(
    userId: string,
    role: string,
  ): Promise<LecturerPermissionKey[]> {
    if (role === 'ADMIN') {
      return this.getAllLecturerPermissions();
    }

    if (role !== 'LECTURER') {
      return [];
    }

    return this.getPermissionsForLecturer(userId);
  }

  async getPermissionSnapshotForLecturer(
    lecturerId: string,
  ): Promise<LecturerPermissionSnapshot> {
    const lecturer = await this.prisma.user.findUnique({
      where: { id: lecturerId },
      select: {
        role: true,
        lecturerRoleId: true,
        lecturerPermissions: {
          select: { permission: true },
          orderBy: { permission: 'asc' },
        },
      },
    });

    if (!lecturer || lecturer.role !== 'LECTURER') {
      return {
        permissions: [],
        individualPermissions: [],
        rolePermissions: [],
        lecturerRole: null,
      };
    }

    const individualPermissions = lecturer.lecturerPermissions.map(
      (item) => item.permission as LecturerPermissionKey,
    );
    let lecturerRole: LecturerRoleSummary | null = null;
    let rolePermissions: LecturerPermissionKey[] = [];

    if (lecturer.lecturerRoleId) {
      const roleRows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          code: string;
          name: string;
          priority: number;
          isActive: boolean;
        }>
      >`
        SELECT
          "id",
          "code",
          "name",
          "priority",
          "isActive"
        FROM "LecturerRole"
        WHERE "id" = ${lecturer.lecturerRoleId}
        LIMIT 1
      `;

      const roleRecord = roleRows[0];

      if (roleRecord) {
        const rolePermissionRows = await this.prisma.$queryRaw<
          Array<{ permission: string }>
        >`
          SELECT "permission"::text AS permission
          FROM "LecturerRolePermission"
          WHERE "roleId" = ${roleRecord.id}
          ORDER BY "permission" ASC
        `;

        lecturerRole = {
          id: roleRecord.id,
          code: roleRecord.code,
          name: roleRecord.name,
          priority: roleRecord.priority,
          isActive: roleRecord.isActive,
        };

        rolePermissions = rolePermissionRows.map(
          (item) => item.permission as LecturerPermissionKey,
        );
      }
    }

    return {
      permissions: this.mergePermissions(individualPermissions, rolePermissions),
      individualPermissions,
      rolePermissions,
      lecturerRole,
    };
  }

  async getPermissionsForLecturer(
    lecturerId: string,
  ): Promise<LecturerPermissionKey[]> {
    const snapshot = await this.getPermissionSnapshotForLecturer(lecturerId);
    return snapshot.permissions;
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

    const permissions = await this.getPermissionsForLecturer(userId);
    return permissions.includes(permission);
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

  canManageLecturerPermissions(
    requesterRole: string,
    requesterPermissions: LecturerPermissionKey[],
  ) {
    if (requesterRole === 'ADMIN') {
      return true;
    }

    return (
      requesterRole === 'LECTURER' &&
      requesterPermissions.includes(LECTURER_ADMIN_PERMISSION)
    );
  }

  assertCanManageLecturerPermissions(
    requesterRole: string,
    requesterPermissions: LecturerPermissionKey[],
  ) {
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
