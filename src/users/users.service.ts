import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import * as xlsx from 'xlsx';
import type {
  QueryUserDto,
  CreateUserDto,
  UpdateUserDto,
  QueryLecturerDto,
  UpdateLecturerPermissionsDto,
} from './dto/user.dto';
import type { Prisma, Role } from '@prisma/client';
import { AuthorizationService } from '../common/authorization/authorization.service';
import {
  LECTURER_ADMIN_PERMISSION,
  type LecturerPermissionKey,
} from '../common/authorization/authorization.constants';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async assertStudentManagementAccess(requesterId: string, requesterRole: string) {
    if (requesterRole === 'ADMIN') {
      return;
    }

    if (requesterRole !== 'LECTURER') {
      throw new ForbiddenException('Bạn không có quyền quản lý sinh viên');
    }

    await this.authorizationService.assertPermission(
      requesterId,
      requesterRole,
      'MANAGE_STUDENTS',
      'Giảng viên chưa được cấp quyền quản lý sinh viên',
    );
  }

  private async assertLecturerPermissionManagementAccess(
    requesterId: string,
    requesterRole: string,
  ): Promise<LecturerPermissionKey[]> {
    const requesterPermissions = await this.authorizationService.getPermissionsForUser(
      requesterId,
      requesterRole,
    );

    this.authorizationService.assertCanManageLecturerPermissions(
      requesterRole,
      requesterPermissions,
    );

    return requesterPermissions;
  }

  private mapLecturerWithPermissions(record: {
    id: string;
    email: string;
    name: string | null;
    isLocked: boolean;
    createdAt: Date;
    lecturerPermissions: { permission: LecturerPermissionKey }[];
  }) {
    const permissions = record.lecturerPermissions.map(
      (item) => item.permission as LecturerPermissionKey,
    );

    return {
      id: record.id,
      email: record.email,
      name: record.name,
      role: 'LECTURER' as const,
      isLocked: record.isLocked,
      createdAt: record.createdAt,
      permissions,
      isLecturerAdmin: permissions.includes(LECTURER_ADMIN_PERMISSION),
    };
  }

  private buildStudentWhere(query: QueryUserDto): Prisma.UserWhereInput {
    const { role, search, className, isLocked } = query;
    const where: Prisma.UserWhereInput = {};

    // This module is scoped to student data management.
    where.role = role ? (role as Role) : 'STUDENT';
    if (isLocked !== undefined) where.isLocked = isLocked;
    if (className) where.className = { contains: className, mode: 'insensitive' };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { studentCode: { contains: search, mode: 'insensitive' } },
        { className: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private isSupportedImportFile(file: Express.Multer.File) {
    const originalName = (file.originalname || '').toLowerCase();
    const mimeType = (file.mimetype || '').toLowerCase();

    const allowedExtensions = ['.csv', '.xlsx', '.xls'];
    const extensionMatch = allowedExtensions.some((ext) => originalName.endsWith(ext));

    const mimeLooksSupported =
      mimeType.includes('csv') ||
      mimeType.includes('excel') ||
      mimeType.includes('spreadsheetml') ||
      mimeType === 'application/octet-stream';

    return extensionMatch || mimeLooksSupported;
  }

  /**
   * Helper to format Date to DDMM for default passwords
   */
  private formatDDMM(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}${m}`;
  }

  /**
   * Find all users with pagination and filtering
   */
  async findAll(query: QueryUserDto, requesterId: string, requesterRole: string) {
    await this.assertStudentManagementAccess(requesterId, requesterRole);

    const { page, limit, role, search, className, isLocked, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where = this.buildStudentWhere({
      page,
      limit,
      role,
      search,
      className,
      isLocked,
      sortOrder,
      format: query.format,
    });

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        select: {
          id: true,
          email: true,
          name: true,
          studentCode: true,
          className: true,
          role: true,
          isEmailVerified: true,
          isLocked: true,
          lockedAt: true,
          lockedReason: true,
          dateOfBirth: true,
          totalPoints: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async exportStudents(query: QueryUserDto, requesterId: string, requesterRole: string) {
    await this.assertStudentManagementAccess(requesterId, requesterRole);

    const where = this.buildStudentWhere(query);
    const students = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: query.sortOrder || 'desc' },
      select: {
        studentCode: true,
        email: true,
        name: true,
        className: true,
        dateOfBirth: true,
        isLocked: true,
        lockedReason: true,
        totalPoints: true,
        createdAt: true,
      },
    });

    const rows = students.map((student) => ({
      studentCode: student.studentCode || '',
      email: student.email,
      name: student.name || '',
      className: student.className || '',
      dateOfBirth: student.dateOfBirth
        ? student.dateOfBirth.toISOString().slice(0, 10)
        : '',
      status: student.isLocked ? 'LOCKED' : 'ACTIVE',
      lockedReason: student.lockedReason || '',
      totalPoints: student.totalPoints,
      createdAt: student.createdAt.toISOString(),
    }));

    const now = new Date();
    const dateStamp = `${now.getFullYear()}${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const format = query.format || 'xlsx';

    if (format === 'csv') {
      const headers = [
        'studentCode',
        'email',
        'name',
        'className',
        'dateOfBirth',
        'status',
        'lockedReason',
        'totalPoints',
        'createdAt',
      ];

      const escapeCsv = (value: string | number) => {
        const text = String(value ?? '');
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      };

      const csvLines = [
        headers.join(','),
        ...rows.map((row) =>
          headers.map((key) => escapeCsv((row as any)[key] ?? '')).join(','),
        ),
      ];

      const csvWithBom = `\uFEFF${csvLines.join('\r\n')}`;
      return {
        fileName: `students_${dateStamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
        buffer: Buffer.from(csvWithBom, 'utf8'),
      };
    }

    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Students');

    const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
    return {
      fileName: `students_${dateStamp}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    };
  }

  /**
   * Get single user
   */
  async findOne(id: string, requesterId: string, requesterRole: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, studentCode: true, className: true, role: true,
        isEmailVerified: true, isLocked: true, lockedAt: true, lockedReason: true,
        dateOfBirth: true, totalPoints: true, createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    if (requesterRole === 'STUDENT' && requesterId !== id) {
      throw new ForbiddenException('Sinh viên chỉ có thể xem thông tin của chính mình');
    }

    if (requesterRole === 'LECTURER') {
      await this.assertStudentManagementAccess(requesterId, requesterRole);
    }

    if (['ADMIN', 'LECTURER'].includes(requesterRole) && user.role !== 'STUDENT') {
      throw new ForbiddenException('Chỉ được thao tác với dữ liệu sinh viên');
    }

    return user;
  }

  /**
   * Create single user (Admin/Lecturer)
   */
  async create(dto: CreateUserDto, requesterId: string, requesterRole: string) {
    await this.assertStudentManagementAccess(requesterId, requesterRole);

    if (dto.role !== 'STUDENT') {
      throw new BadRequestException('Chỉ được tạo tài khoản với vai trò STUDENT');
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.email },
          ...(dto.studentCode ? [{ studentCode: dto.studentCode }] : []),
        ],
      },
    });

    if (existing) {
      if (existing.email === dto.email) throw new ConflictException('Email đã tồn tại');
      if (existing.studentCode === dto.studentCode) throw new ConflictException('MSSV đã tồn tại');
    }

    // Default password logic based on project spec
    let plainPassword = 'password123';
    let dobDate: Date | undefined;

    if (dto.role === 'STUDENT' && dto.dateOfBirth) {
      dobDate = new Date(dto.dateOfBirth);
      plainPassword = this.formatDDMM(dobDate);
    }

    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        role: dto.role as Role,
        studentCode: dto.studentCode,
        className: dto.role === 'STUDENT' ? (dto.className || null) : null,
        password: hashedPassword,
        dateOfBirth: dobDate,
        isEmailVerified: true, // Created by admin = verified
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      message: `Tài khoản tạo thành công. Mật khẩu mặc định: ${plainPassword}`,
    };
  }

  async findLecturers(query: QueryLecturerDto, requesterId: string, requesterRole: string) {
    const requesterPermissions = await this.assertLecturerPermissionManagementAccess(
      requesterId,
      requesterRole,
    );

    const { page, limit, search, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = { role: 'LECTURER' };
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: sortOrder },
        select: {
          id: true,
          email: true,
          name: true,
          isLocked: true,
          createdAt: true,
          lecturerPermissions: {
            select: { permission: true },
            orderBy: { permission: 'asc' },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.mapLecturerWithPermissions(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      requesterPermissions,
      assignablePermissions:
        requesterRole === 'ADMIN'
          ? this.authorizationService.getAllLecturerPermissions()
          : this.authorizationService.getLowerLecturerPermissions(),
      canGrantAdminPackage: requesterRole === 'ADMIN',
    };
  }

  async getLecturerPermissions(lecturerId: string, requesterId: string, requesterRole: string) {
    const requesterPermissions = await this.assertLecturerPermissionManagementAccess(
      requesterId,
      requesterRole,
    );

    const lecturer = await this.prisma.user.findUnique({
      where: { id: lecturerId },
      select: {
        id: true,
        email: true,
        name: true,
        isLocked: true,
        createdAt: true,
        role: true,
        lecturerPermissions: {
          select: {
            permission: true,
            grantedAt: true,
            grantedByUser: {
              select: { id: true, email: true, name: true },
            },
          },
          orderBy: { permission: 'asc' },
        },
      },
    });

    if (!lecturer || lecturer.role !== 'LECTURER') {
      throw new NotFoundException('Giảng viên không tồn tại');
    }

    const permissions = lecturer.lecturerPermissions.map((item) => item.permission);

    return {
      id: lecturer.id,
      email: lecturer.email,
      name: lecturer.name,
      role: lecturer.role,
      isLocked: lecturer.isLocked,
      createdAt: lecturer.createdAt,
      permissions,
      isLecturerAdmin: permissions.includes(LECTURER_ADMIN_PERMISSION),
      assignments: lecturer.lecturerPermissions,
      requesterPermissions,
      assignablePermissions:
        requesterRole === 'ADMIN'
          ? this.authorizationService.getAllLecturerPermissions()
          : this.authorizationService.getLowerLecturerPermissions(),
      canGrantAdminPackage: requesterRole === 'ADMIN',
    };
  }

  async updateLecturerPermissions(
    lecturerId: string,
    dto: UpdateLecturerPermissionsDto,
    requesterId: string,
    requesterRole: string,
  ) {
    const requesterPermissions = await this.assertLecturerPermissionManagementAccess(
      requesterId,
      requesterRole,
    );

    const lecturer = await this.prisma.user.findUnique({
      where: { id: lecturerId },
      select: {
        id: true,
        role: true,
        lecturerPermissions: {
          select: { permission: true },
        },
      },
    });

    if (!lecturer || lecturer.role !== 'LECTURER') {
      throw new NotFoundException('Giảng viên không tồn tại');
    }

    const requestedPermissions = [...new Set(dto.permissions)] as LecturerPermissionKey[];
    const currentPermissions = lecturer.lecturerPermissions.map(
      (item) => item.permission as LecturerPermissionKey,
    );

    if (
      requesterRole !== 'ADMIN' &&
      currentPermissions.includes(LECTURER_ADMIN_PERMISSION)
    ) {
      throw new ForbiddenException(
        'Giảng viên có quyền admin chỉ được quản lý bởi ADMIN gốc.',
      );
    }

    for (const permission of requestedPermissions) {
      this.authorizationService.assertCanGrantPermission(
        requesterRole,
        requesterPermissions,
        permission,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lecturerPermissionAssignment.deleteMany({
        where: { lecturerId },
      });

      if (requestedPermissions.length > 0) {
        await tx.lecturerPermissionAssignment.createMany({
          data: requestedPermissions.map((permission) => ({
            lecturerId,
            permission,
            grantedByUserId: requesterId,
          })),
        });
      }
    });

    const refreshedPermissions = await this.authorizationService.getPermissionsForLecturer(lecturerId);

    return {
      lecturerId,
      permissions: refreshedPermissions,
      isLecturerAdmin: refreshedPermissions.includes(LECTURER_ADMIN_PERMISSION),
      updatedBy: requesterId,
      canGrantAdminPackage: requesterRole === 'ADMIN',
    };
  }

  /**
   * Update user status (lock/unlock)
   */
  async update(id: string, dto: UpdateUserDto, requesterId: string, requesterRole: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    const isStudentSelf = requesterRole === 'STUDENT' && requesterId === id;

    if (requesterRole === 'STUDENT') {
      if (!isStudentSelf) {
        throw new ForbiddenException('Sinh viên chỉ có thể cập nhật thông tin của chính mình');
      }

      if (dto.isLocked !== undefined || dto.lockedReason !== undefined) {
        throw new ForbiddenException('Sinh viên không có quyền khóa/mở khóa tài khoản');
      }

      if (dto.email !== undefined || dto.studentCode !== undefined) {
        throw new ForbiddenException('Sinh viên không có quyền đổi email hoặc MSSV');
      }
    } else {
      await this.assertStudentManagementAccess(requesterId, requesterRole);

      if (user.role !== 'STUDENT') {
        throw new ForbiddenException('Chỉ được thao tác với dữ liệu sinh viên');
      }
    }

    if (dto.email && dto.email !== user.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (dto.studentCode !== undefined && dto.studentCode !== user.studentCode) {
      if (dto.studentCode) {
        const studentCodeExists = await this.prisma.user.findUnique({ where: { studentCode: dto.studentCode } });
        if (studentCodeExists) {
          throw new ConflictException('MSSV đã tồn tại');
        }
      }
    }

    const parsedDob = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;
    const shouldUpdatePasswordByDob =
      !isStudentSelf &&
      user.role === 'STUDENT' &&
      dto.dateOfBirth !== undefined &&
      parsedDob &&
      !Number.isNaN(parsedDob.getTime());

    let newPasswordHash: string | undefined;
    if (shouldUpdatePasswordByDob && parsedDob) {
      newPasswordHash = await bcrypt.hash(this.formatDDMM(parsedDob), 10);
    }

    // Only update allowed fields
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.studentCode !== undefined && { studentCode: dto.studentCode || null }),
        ...(dto.name && { name: dto.name }),
        ...(dto.className !== undefined && { className: dto.className || null }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: parsedDob }),
        ...(newPasswordHash && { password: newPasswordHash }),
        ...(dto.isLocked !== undefined && {
          isLocked: dto.isLocked,
          lockedAt: dto.isLocked ? new Date() : null,
          lockedReason: dto.isLocked ? dto.lockedReason || 'Khóa bởi quản trị viên' : null,
        }),
      },
      select: {
        id: true,
        email: true,
        studentCode: true,
        name: true,
        className: true,
        dateOfBirth: true,
        isLocked: true,
        lockedReason: true,
      },
    });
  }

  async remove(id: string, requesterId: string, requesterRole: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    if (requesterRole === 'STUDENT') {
      if (requesterId !== id) {
        throw new ForbiddenException('Sinh viên chỉ có thể xóa tài khoản của chính mình');
      }
    } else {
      await this.assertStudentManagementAccess(requesterId, requesterRole);

      if (user.role !== 'STUDENT') {
        throw new ForbiddenException('Chỉ được thao tác với dữ liệu sinh viên');
      }
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new BadRequestException('Không thể xóa tài khoản vì còn dữ liệu liên quan');
      }
      throw err;
    }

    return { message: 'Xóa người dùng thành công' };
  }

  /**
   * Import students from CSV/Excel
  * Expected columns: studentCode, email, name, className?, dateOfBirth (YYYY-MM-DD or DD/MM/YYYY)
   */
  async importStudents(file: Express.Multer.File, requesterId: string, requesterRole: string) {
    await this.assertStudentManagementAccess(requesterId, requesterRole);

    if (!file) throw new BadRequestException('Vui lòng upload file Excel/CSV');
    if (!this.isSupportedImportFile(file)) {
      throw new BadRequestException('Định dạng file không hợp lệ. Chỉ hỗ trợ CSV, XLS, XLSX');
    }

    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet) as any[];

    if (data.length === 0) {
      throw new BadRequestException('File không có dữ liệu');
    }

    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    // We process sequentially to catch specific errors, but in production
    // a bulk insert with ON CONFLICT DO NOTHING is faster
    for (const [index, row] of data.entries()) {
      const rowNum = index + 2; // +1 for 0-index, +1 for header
      
      try {
        const studentCode = row.studentCode?.toString()?.trim();
        const email = row.email?.toString()?.trim()?.toLowerCase();
        const name = row.name?.toString()?.trim();
        const className = row.className?.toString()?.trim();
        const dobStr = row.dateOfBirth?.toString()?.trim();

        if (!studentCode || !email || !name) {
          throw new Error('Thiếu trường bắt buộc (studentCode, email, name)');
        }

        if (!email.endsWith('@student.iuh.edu.vn')) {
          throw new Error('Email phải có đuôi @student.iuh.edu.vn');
        }

        // Parse date properly depending on format
        let dobDate = new Date();
        let plainPassword = 'password123';

        if (dobStr) {
          // If Excel date serial number
          if (typeof row.dateOfBirth === 'number') {
            dobDate = new Date((row.dateOfBirth - (25567 + 1)) * 86400 * 1000);
          } else if (dobStr.includes('/')) {
            // Assume DD/MM/YYYY
            const parts = dobStr.split('/');
            if (parts.length === 3) {
              dobDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
          } else {
            // Try standard parse
            dobDate = new Date(dobStr);
          }

          if (!isNaN(dobDate.getTime())) {
            plainPassword = this.formatDDMM(dobDate);
          }
        }

        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        // Try to insert
        await this.prisma.user.create({
          data: {
            studentCode,
            email,
            name,
            role: 'STUDENT',
            password: hashedPassword,
            className: className || null,
            dateOfBirth: !isNaN(dobDate.getTime()) ? dobDate : undefined,
            isEmailVerified: true, // Imported lists are assumed verified
          },
        });

        results.success++;
      } catch (err) {
        // If it's a Prisma unique constraint violation
        if (err.code === 'P2002') {
          results.errors.push(`Dòng ${rowNum}: MSSV hoặc Email đã tồn tại`);
        } else {
          results.errors.push(`Dòng ${rowNum}: ${(err as Error).message}`);
        }
        results.failed++;
      }
    }

    return results;
  }
}
