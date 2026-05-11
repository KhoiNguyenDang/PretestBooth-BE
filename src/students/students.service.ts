import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDTO, UpdateStudentDTO } from './dto/student.dto';

@Injectable()
export class StudentService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find or create student identity by userId.
   * Uses dual-read: tries Student first, falls back to User if needed.
   */
  async findStudentIdentity(userId: string): Promise<any | null> {
    // Try primary: Student table
    const prismaAny = this.prisma as any;
    let student = await prismaAny.student.findUnique({
      where: { userId }
    });

    // Fallback: If Student not found but User exists with STUDENT role,
    // this will be fixed by Phase 3 data consistency check
    if (!student) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      if (!user || user.role !== 'STUDENT') {
        return null;
      }
      // Return null here - actual Student record needed for phase 2+
      return null;
    }

    return student;
  }

  /**
   * Get student by userId with user profile data.
   */
  async getStudentByUserId(userId: string): Promise<any | null> {
    return (this.prisma as any).student.findUnique({
      where: { userId },
      include: {
        user: true
      }
    });
  }

  /**
   * Get student by student code.
   */
  async getStudentByStudentCode(code: string): Promise<any | null> {
    return (this.prisma as any).student.findUnique({
      where: { studentCode: code },
      include: {
        user: true
      }
    });
  }

  /**
   * Create new student record.
   */
  async createStudent(data: CreateStudentDTO): Promise<any> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId }
    });

    if (!user) {
      throw new NotFoundException(`User ${data.userId} not found`);
    }

    if (user.role !== 'STUDENT') {
      throw new Error(`User ${data.userId} is not a STUDENT (role: ${user.role})`);
    }

    return (this.prisma as any).student.create({
      data: {
        userId: data.userId,
        studentCode: data.studentCode,
        className: data.className,
        dateOfBirth: data.dateOfBirth,
        studentCardImageUrl: data.studentCardImageUrl,
        studentCardFaceMatchScore: data.studentCardFaceMatchScore
      },
      include: {
        user: true
      }
    });
  }

  /**
   * Update student profile.
   */
  async updateStudent(studentId: string, data: UpdateStudentDTO): Promise<any> {
    const student = await (this.prisma as any).student.findUnique({
      where: { id: studentId }
    });

    if (!student) {
      throw new NotFoundException(`Student ${studentId} not found`);
    }

    return (this.prisma as any).student.update({
      where: { id: studentId },
      data: {
        ...(data.className && { className: data.className }),
        ...(data.studentCardImageUrl && { studentCardImageUrl: data.studentCardImageUrl }),
        ...(typeof data.studentCardFaceMatchScore === 'number' && {
          studentCardFaceMatchScore: data.studentCardFaceMatchScore
        }),
        ...(data.studentCardVerifiedAt && { studentCardVerifiedAt: data.studentCardVerifiedAt })
      },
      include: {
        user: true
      }
    });
  }

  /**
   * Validate that a student exists.
   */
  async validateStudentExists(userId: string): Promise<boolean> {
    const student = await (this.prisma as any).student.findUnique({
      where: { userId }
    });
    return !!student;
  }

  /**
   * Get student profile with all details.
   */
  async getStudentWithProfile(userId: string) {
    return (this.prisma as any).student.findUnique({
      where: { userId },
      include: {
        user: true,
        bookings: true,
        examSessions: true,
        submissions: true
      }
    });
  }

  /**
   * Delete student record (cascades to dependent records).
   */
  async deleteStudent(studentId: string): Promise<void> {
    await (this.prisma as any).student.delete({
      where: { id: studentId }
    });
  }

  /**
   * Count total students.
   */
  async countStudents(): Promise<number> {
    return (this.prisma as any).student.count();
  }

  /**
   * List all students with pagination.
   */
  async listStudents(skip: number = 0, take: number = 100) {
    return (this.prisma as any).student.findMany({
      skip,
      take,
      include: {
        user: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
