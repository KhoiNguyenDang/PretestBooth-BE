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

type LecturerRoleWithPermissions = {
  id: string;
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
  permissions: Array<{ permission: string }>;
};

@Injectable()
export class AuthorizationService {
  constructor(private readonly prisma: PrismaService) {}

  private mergePermissions(
    ...permissionGroups: LecturerPermissionKey[][]
  ): LecturerPermissionKey[] {
    return Array.from(new Set(permissionGroups.flat())).sort((a, b) => a.localeCompare(b));
  }

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

  async getPermissionSnapshotForLecturer(lecturerId: string): Promise<LecturerPermissionSnapshot> {
    const [legacyLecturer, lecturerProfile] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: lecturerId },
        select: {
          role: true,
        },
      }),
      this.prisma.lecturer.findUnique({
        where: { userId: lecturerId },
        select: {
          userId: true,
          lecturerRoleId: true,
          lecturerPermissions: {
            select: { permission: true },
            orderBy: { permission: 'asc' },
          },
          lecturerRole: {
            select: {
              id: true,
              code: true,
              name: true,
              priority: true,
              isActive: true,
              permissions: {
                select: { permission: true },
                orderBy: { permission: 'asc' },
              },
            },
          },
        },
      }),
    ]);

    if (!legacyLecturer || legacyLecturer.role !== 'LECTURER') {
      return {
        permissions: [],
        individualPermissions: [],
        rolePermissions: [],
        lecturerRole: null,
      };
    }

    const individualPermissions = ((lecturerProfile?.lecturerPermissions ?? []) as Array<{
      permission: LecturerPermissionKey;
    }>).map((item) => item.permission);
    let lecturerRole: LecturerRoleSummary | null = null;
    let rolePermissions: LecturerPermissionKey[] = [];

    const roleRecord = lecturerProfile?.lecturerRole;

    if (roleRecord) {
      lecturerRole = {
        id: roleRecord.id,
        code: roleRecord.code,
        name: roleRecord.name,
        priority: roleRecord.priority,
        isActive: roleRecord.isActive,
      };

      rolePermissions = roleRecord.permissions.map(
        (item) => item.permission as LecturerPermissionKey,
      );
    } else if (lecturerProfile?.lecturerRoleId) {
      const fallbackRoleRows = await this.prisma.lecturerRole.findUnique({
        where: { id: lecturerProfile.lecturerRoleId },
        select: {
          id: true,
          code: true,
          name: true,
          priority: true,
          isActive: true,
          permissions: {
            select: { permission: true },
            orderBy: { permission: 'asc' },
          },
        },
      });

      if (fallbackRoleRows) {
        const roleRecordWithPermissions = fallbackRoleRows as LecturerRoleWithPermissions;
        lecturerRole = {
          id: roleRecordWithPermissions.id,
          code: roleRecordWithPermissions.code,
          name: roleRecordWithPermissions.name,
          priority: roleRecordWithPermissions.priority,
          isActive: roleRecordWithPermissions.isActive,
        };

        rolePermissions = roleRecordWithPermissions.permissions.map(
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

  async getPermissionsForLecturer(lecturerId: string): Promise<LecturerPermissionKey[]> {
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

    return requesterRole === 'LECTURER' && requesterPermissions.includes(LECTURER_ADMIN_PERMISSION);
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
