import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * DualWriteService ensures data consistency during phase 2.
 * When creating/updating records that have dual FKs (old userId + new studentId/lecturerId),
 * this service writes to both to ensure backward compatibility.
 */
@Injectable()
export class DualWriteService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create booking with dual-write support.
   * Writes to both userId (old) and studentId (new) FK columns.
   */
  async createBookingDualWrite(
    data: any,
    student: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.booking.create({
        data: {
          ...data,
          userId: student.userId,  // OLD FK for backward compat
          studentId: student.id     // NEW FK for new code
        }
      });
    });
  }

  /**
   * Create exam session with dual-write support.
   */
  async createExamSessionDualWrite(
    data: any,
    student: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.examSession.create({
        data: {
          ...data,
          userId: student.userId,
          studentId: student.id
        }
      });
    });
  }

  /**
   * Create submission with dual-write support.
   */
  async createSubmissionDualWrite(
    data: any,
    student: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.submission.create({
        data: {
          ...data,
          userId: student.userId,
          studentId: student.id
        }
      });
    });
  }

  /**
   * Create practice session with dual-write support.
   */
  async createPracticeSessionDualWrite(
    data: any,
    student: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.practiceSession.create({
        data: {
          ...data,
          userId: student.userId,
          studentId: student.id
        }
      });
    });
  }

  /**
   * Create booking checkin attempt with dual-write support.
   */
  async createBookingCheckinAttemptDualWrite(
    data: any,
    student: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.bookingCheckinAttempt.create({
        data: {
          ...data,
          userId: student.userId,
          studentId: student.id
        }
      });
    });
  }

  /**
   * Create point transaction with dual-write support.
   */
  async createPointTransactionDualWrite(
    data: any,
    student: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.pointTransaction.create({
        data: {
          ...data,
          userId: student.userId,
          studentId: student.id
        }
      });
    });
  }

  /**
   * Create problem with dual-write support.
   */
  async createProblemDualWrite(
    data: any,
    lecturer: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.problem.create({
        data: {
          ...data,
          creatorId: lecturer.userId,  // OLD FK for backward compat
          lecturerId: lecturer.id       // NEW FK for new code
        }
      });
    });
  }

  /**
   * Create question with dual-write support.
   */
  async createQuestionDualWrite(
    data: any,
    lecturer: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.question.create({
        data: {
          ...data,
          creatorId: lecturer.userId,
          lecturerId: lecturer.id
        }
      });
    });
  }

  /**
   * Create exam with dual-write support.
   */
  async createExamDualWrite(
    data: any,
    lecturer: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.exam.create({
        data: {
          ...data,
          creatorId: lecturer.userId,
          lecturerId: lecturer.id
        }
      });
    });
  }

  /**
   * Create question review action with dual-write support.
   */
  async createQuestionReviewActionDualWrite(
    data: any,
    lecturer: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.questionReviewAction.create({
        data: {
          ...data,
          userId: lecturer.userId,
          lecturerId: lecturer.id
        }
      });
    });
  }

  /**
   * Update booking to set both FKs.
   */
  async updateBookingDualWrite(
    bookingId: string,
    data: any,
    student?: any
  ) {
    return await this.prisma.$transaction(async (tx) => {
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          ...data,
          ...(student && {
            userId: student.userId,
            studentId: student.id
          })
        }
      });
    });
  }

  /**
   * Backfill dual FKs for existing record without transaction overhead.
   * Used during data migration to populate new FK columns.
   */
  async backfillStudentFK(tableName: string, recordId: string, studentId: string) {
    // Dynamically update based on table name
    const queries: Record<string, any> = {
      Booking: () =>
        (this.prisma as any).booking.update({
          where: { id: recordId },
          data: { studentId } as any
        }),
      ExamSession: () =>
        (this.prisma as any).examSession.update({
          where: { id: recordId },
          data: { studentId } as any
        }),
      Submission: () =>
        (this.prisma as any).submission.update({
          where: { id: recordId },
          data: { studentId } as any
        }),
      PracticeSession: () =>
        (this.prisma as any).practiceSession.update({
          where: { id: recordId },
          data: { studentId } as any
        }),
      BookingCheckinAttempt: () =>
        (this.prisma as any).bookingCheckinAttempt.update({
          where: { id: recordId },
          data: { studentId } as any
        }),
      PointTransaction: () =>
        (this.prisma as any).pointTransaction.update({
          where: { id: recordId },
          data: { studentId } as any
        })
    };

    return queries[tableName]?.();
  }

  /**
   * Backfill dual FKs for lecturer records.
   */
  async backfillLecturerFK(tableName: string, recordId: string, lecturerId: string) {
    const queries: Record<string, any> = {
      Problem: () =>
        (this.prisma as any).problem.update({
          where: { id: recordId },
          data: { lecturerId } as any
        }),
      Question: () =>
        (this.prisma as any).question.update({
          where: { id: recordId },
          data: { lecturerId } as any
        }),
      Exam: () =>
        (this.prisma as any).exam.update({
          where: { id: recordId },
          data: { lecturerId } as any
        }),
      QuestionReviewAction: () =>
        (this.prisma as any).questionReviewAction.update({
          where: { id: recordId },
          data: { lecturerId } as any
        })
    };

    return queries[tableName]?.();
  }
}
