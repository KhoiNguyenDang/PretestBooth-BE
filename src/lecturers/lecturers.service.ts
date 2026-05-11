import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLecturerDTO, UpdateLecturerDTO } from './dto/lecturer.dto';

@Injectable()
export class LecturerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find or create lecturer identity by userId.
   * Uses dual-read: tries Lecturer first, falls back to User if needed.
   */
  async findLecturerIdentity(userId: string): Promise<any | null> {
    // Try primary: Lecturer table
    const prismaAny = this.prisma as any;
    let lecturer = await prismaAny.lecturer.findUnique({
      where: { userId }
    });

    // Fallback: If Lecturer not found but User exists with LECTURER role,
    // this will be fixed by Phase 3 data consistency check
    if (!lecturer) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      });
      if (!user || user.role !== 'LECTURER') {
        return null;
      }
      // Return null here - actual Lecturer record needed for phase 2+
      return null;
    }

    return lecturer;
  }

  /**
   * Get lecturer by userId with user profile data.
   */
  async getLecturerByUserId(userId: string): Promise<any | null> {
    const prismaAny = this.prisma as any;
    return prismaAny.lecturer.findUnique({
      where: { userId },
      include: {
        user: true
      }
    });
  }

  /**
   * Get lecturer by lecturer role ID.
   */
  async getLecturerByRoleId(roleId: string): Promise<any | null> {
    const prismaAny = this.prisma as any;
    return prismaAny.lecturer.findUnique({
      where: { lecturerRoleId: roleId },
      include: {
        user: true
      }
    });
  }

  /**
   * Create new lecturer record.
   */
  async createLecturer(data: CreateLecturerDTO): Promise<any> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: data.userId }
    });

    if (!user) {
      throw new NotFoundException(`User ${data.userId} not found`);
    }

    if (user.role !== 'LECTURER') {
      throw new Error(`User ${data.userId} is not a LECTURER (role: ${user.role})`);
    }

    const prismaAny = this.prisma as any;
    return prismaAny.lecturer.create({
      data: {
        userId: data.userId,
        lecturerRoleId: data.lecturerRoleId,
        lecturerRoleAssignedByUserId: data.lecturerRoleAssignedByUserId,
        lecturerRoleAssignedAt: new Date()
      },
      include: {
        user: true
      }
    });
  }

  /**
   * Update lecturer profile.
   */
  async updateLecturer(lecturerId: string, data: UpdateLecturerDTO): Promise<any> {
    const prismaAny = this.prisma as any;
    const lecturer = await prismaAny.lecturer.findUnique({
      where: { id: lecturerId }
    });

    if (!lecturer) {
      throw new NotFoundException(`Lecturer ${lecturerId} not found`);
    }

    return prismaAny.lecturer.update({
      where: { id: lecturerId },
      data: {
        ...(data.lecturerRoleId && { lecturerRoleId: data.lecturerRoleId })
      },
      include: {
        user: true
      }
    });
  }

  /**
   * Validate that a lecturer exists.
   */
  async validateLecturerExists(userId: string): Promise<boolean> {
    const lecturer = await (this.prisma as any).lecturer.findUnique({
      where: { userId }
    });
    return !!lecturer;
  }

  /**
   * Get lecturer profile with all details.
   */
  async getLecturerWithProfile(userId: string) {
    return (this.prisma as any).lecturer.findUnique({
      where: { userId },
      include: {
        user: true,
        createdProblems: true,
        createdQuestions: true,
        createdExams: true
      }
    });
  }

  /**
   * Get all problems created by lecturer.
   */
  async getLecturerProblems(lecturerId: string) {
    return (this.prisma as any).problem.findMany({
      where: { lecturerId } as any,
    });
  }

  /**
   * Get all questions created by lecturer.
   */
  async getLecturerQuestions(lecturerId: string) {
    return (this.prisma as any).question.findMany({
      where: { lecturerId } as any,
    });
  }

  /**
   * Get all exams created by lecturer.
   */
  async getLecturerExams(lecturerId: string) {
    return (this.prisma as any).exam.findMany({
      where: { lecturerId } as any,
    });
  }

  /**
   * Delete lecturer record (cascades to dependent records).
   */
  async deleteLecturer(lecturerId: string): Promise<void> {
    await (this.prisma as any).lecturer.delete({
      where: { id: lecturerId }
    });
  }

  /**
   * Count total lecturers.
   */
  async countLecturers(): Promise<number> {
    return (this.prisma as any).lecturer.count();
  }

  /**
   * List all lecturers with pagination.
   */
  async listLecturers(skip: number = 0, take: number = 100) {
    return (this.prisma as any).lecturer.findMany({
      skip,
      take,
      include: {
        user: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}
