import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as xlsx from 'xlsx';
import type { QueryUserDto, CreateUserDto, UpdateUserDto } from './dto/user.dto';
import type { Prisma, Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
  async findAll(query: QueryUserDto) {
    const { page, limit, role, search, className, isLocked, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (role) where.role = role as Role;
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

  /**
   * Get single user
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, studentCode: true, className: true, role: true,
        isEmailVerified: true, isLocked: true, lockedAt: true, lockedReason: true,
        dateOfBirth: true, totalPoints: true, createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Người dùng không tồn tại');
    return user;
  }

  /**
   * Create single user (Admin/Lecturer)
   */
  async create(dto: CreateUserDto) {
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

  /**
   * Update user status (lock/unlock)
   */
  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    // Only update allowed fields
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.className !== undefined && { className: dto.className || null }),
        ...(dto.isLocked !== undefined && {
          isLocked: dto.isLocked,
          lockedAt: dto.isLocked ? new Date() : null,
          lockedReason: dto.isLocked ? dto.lockedReason || 'Khóa bởi quản trị viên' : null,
        }),
      },
      select: { id: true, name: true, isLocked: true, lockedReason: true },
    });
  }

  /**
   * Import students from CSV/Excel
  * Expected columns: studentCode, email, name, className?, dateOfBirth (YYYY-MM-DD or DD/MM/YYYY)
   */
  async importStudents(file: Express.Multer.File) {
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
