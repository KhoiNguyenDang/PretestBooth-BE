import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const prismaAny = prisma as any;

/**
 * Migration script: Populate Student and Lecturer tables from existing User data
 * 
 * This script:
 * 1. Creates Student records for all users with role='STUDENT'
 * 2. Creates Lecturer records for all users with role='LECTURER'
 * 3. Backfills FK columns in dependent tables
 * 4. Validates data integrity
 */

async function migrateUserRolesToSubtables() {
  console.log('🚀 Starting User role migration to Student/Lecturer tables...\n');

  try {
    // Step 1: Migrate STUDENT users
    console.log('📊 Step 1: Migrating STUDENT users...');
    const studentUsers = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      include: { profile: true },
    });

    console.log(`   Found ${studentUsers.length} STUDENT users to migrate`);

    for (const user of studentUsers) {
      const studentId = uuidv4();
      try {
        await prismaAny.student.create({
          data: {
            id: studentId,
            userId: user.id,
            studentCode: user.profile?.studentCode || user.studentCode,
            className: user.profile?.className,
            dateOfBirth: user.profile?.dateOfBirth,
            studentCardImageUrl: user.profile?.studentCardImageUrl,
            studentCardVerifiedAt: user.profile?.studentCardVerifiedAt,
            studentCardFaceMatchScore: user.profile?.studentCardFaceMatchScore,
          },
        });
      } catch (error) {
        console.error(
          `   ❌ Failed to create Student record for user ${user.id}:`,
          error,
        );
        throw error;
      }
    }
    console.log(`   ✅ Successfully migrated ${studentUsers.length} STUDENT records\n`);

    // Step 2: Migrate LECTURER users
    console.log('📊 Step 2: Migrating LECTURER users...');
    const lecturerUsers = await prisma.user.findMany({
      where: { role: 'LECTURER' },
      include: { lecturerMetadata: true },
    });

    console.log(`   Found ${lecturerUsers.length} LECTURER users to migrate`);

    for (const user of lecturerUsers) {
      const lecturerId = uuidv4();
      const metadata = user.lecturerMetadata;

      try {
        await prismaAny.lecturer.create({
          data: {
            id: lecturerId,
            userId: user.id,
            lecturerRoleId: metadata?.lecturerRoleId,
            lecturerRoleAssignedAt: metadata?.lecturerRoleAssignedAt,
            lecturerRoleAssignedByUserId: metadata?.lecturerRoleAssignedByUserId,
          },
        });
      } catch (error) {
        console.error(
          `   ❌ Failed to create Lecturer record for user ${user.id}:`,
          error,
        );
        throw error;
      }
    }
    console.log(`   ✅ Successfully migrated ${lecturerUsers.length} LECTURER records\n`);

    // Step 3: Backfill FK columns in dependent tables
    console.log('📊 Step 3: Backfilling FK columns in dependent tables...');

    // Get mapping of userId -> studentId
    const studentMap = new Map<string, string>();
    const students = await prismaAny.student.findMany({
      select: { id: true, userId: true },
    });
    students.forEach((s) => studentMap.set(s.userId, s.id));

    // Backfill Booking.studentId
    const bookingUpdates = await prismaAny.booking.updateMany({
      where: { userId: { in: Array.from(studentMap.keys()) }, studentId: null },
      data: { studentId: null }, // This won't work for batch, need to loop
    });
    // Actually, we need to update individually or use raw SQL
    let bookingCount = 0;
    for (const [userId, studentId] of studentMap) {
      const updated = await prismaAny.booking.updateMany({
        where: { userId, studentId: null },
        data: { studentId },
      });
      bookingCount += updated.count;
    }
    console.log(`   ✅ Updated ${bookingCount} Booking records`);

    // Backfill ExamSession.studentId
    let examSessionCount = 0;
    for (const [userId, studentId] of studentMap) {
      const updated = await prismaAny.examSession.updateMany({
        where: { userId, studentId: null },
        data: { studentId },
      });
      examSessionCount += updated.count;
    }
    console.log(`   ✅ Updated ${examSessionCount} ExamSession records`);

    // Backfill Submission.studentId
    let submissionCount = 0;
    for (const [userId, studentId] of studentMap) {
      const updated = await prismaAny.submission.updateMany({
        where: { userId, studentId: null },
        data: { studentId },
      });
      submissionCount += updated.count;
    }
    console.log(`   ✅ Updated ${submissionCount} Submission records`);

    // Backfill PracticeSession.studentId
    let practiceSessionCount = 0;
    for (const [userId, studentId] of studentMap) {
      const updated = await prismaAny.practiceSession.updateMany({
        where: { userId, studentId: null },
        data: { studentId },
      });
      practiceSessionCount += updated.count;
    }
    console.log(`   ✅ Updated ${practiceSessionCount} PracticeSession records`);

    // Backfill BookingCheckinAttempt.studentId
    let checkinAttemptCount = 0;
    for (const [userId, studentId] of studentMap) {
      const updated = await prismaAny.bookingCheckinAttempt.updateMany({
        where: { userId, studentId: null },
        data: { studentId },
      });
      checkinAttemptCount += updated.count;
    }
    console.log(`   ✅ Updated ${checkinAttemptCount} BookingCheckinAttempt records`);

    // Backfill PointTransaction.studentId
    let pointTransactionCount = 0;
    for (const [userId, studentId] of studentMap) {
      const updated = await prismaAny.pointTransaction.updateMany({
        where: { userId, studentId: null },
        data: { studentId },
      });
      pointTransactionCount += updated.count;
    }
    console.log(`   ✅ Updated ${pointTransactionCount} PointTransaction records`);

    // Get mapping of userId -> lecturerId
    const lecturerMap = new Map<string, string>();
    const lecturers = await prismaAny.lecturer.findMany({
      select: { id: true, userId: true },
    });
    lecturers.forEach((l) => lecturerMap.set(l.userId, l.id));

    // Backfill Problem.lecturerId
    let problemCount = 0;
    for (const [userId, lecturerId] of lecturerMap) {
      const updated = await prismaAny.problem.updateMany({
        where: { creatorId: userId, lecturerId: null },
        data: { lecturerId },
      });
      problemCount += updated.count;
    }
    console.log(`   ✅ Updated ${problemCount} Problem records`);

    // Backfill Question.lecturerId
    let questionCount = 0;
    for (const [userId, lecturerId] of lecturerMap) {
      const updated = await prismaAny.question.updateMany({
        where: { creatorId: userId, lecturerId: null },
        data: { lecturerId },
      });
      questionCount += updated.count;
    }
    console.log(`   ✅ Updated ${questionCount} Question records`);

    // Backfill Exam.lecturerId
    let examCount = 0;
    for (const [userId, lecturerId] of lecturerMap) {
      const updated = await prismaAny.exam.updateMany({
        where: { creatorId: userId, lecturerId: null },
        data: { lecturerId },
      });
      examCount += updated.count;
    }
    console.log(`   ✅ Updated ${examCount} Exam records`);

    // Backfill QuestionReviewAction.lecturerId
    let reviewActionCount = 0;
    for (const [userId, lecturerId] of lecturerMap) {
      const updated = await prismaAny.questionReviewAction.updateMany({
        where: { reviewedBy: userId, lecturerId: null },
        data: { lecturerId },
      });
      reviewActionCount += updated.count;
    }
    console.log(`   ✅ Updated ${reviewActionCount} QuestionReviewAction records\n`);

    // Step 4: Data validation
    console.log('📊 Step 4: Validating data integrity...');

    // Check for orphaned Bookings
    const orphanedBookings = await prismaAny.booking.count({
      where: { userId: { notIn: (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id) },
      },
    });
    console.log(`   Orphaned Booking records: ${orphanedBookings}`);

    // Check Student count
    const studentCount = await prismaAny.student.count();
    console.log(`   Total Student records: ${studentCount}`);

    // Check Lecturer count
    const lecturerCount = await prismaAny.lecturer.count();
    console.log(`   Total Lecturer records: ${lecturerCount}`);

    // Check for Students without userId relation (should be 0)
    const brokenStudents = await prismaAny.student.count({
      where: {
        user: {
          is: null,
        },
      },
    });
    console.log(`   Broken Student relations (should be 0): ${brokenStudents}`);

    // Check for Lecturers without userId relation (should be 0)
    const brokenLecturers = await prismaAny.lecturer.count({
      where: {
        user: {
          is: null,
        },
      },
    });
    console.log(`   Broken Lecturer relations (should be 0): ${brokenLecturers}`);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Migration Summary:');
    console.log(`   - STUDENT records created: ${studentUsers.length}`);
    console.log(`   - LECTURER records created: ${lecturerUsers.length}`);
    console.log(`   - Booking records backfilled: ${bookingCount}`);
    console.log(`   - ExamSession records backfilled: ${examSessionCount}`);
    console.log(`   - Submission records backfilled: ${submissionCount}`);
    console.log(`   - Problem records backfilled: ${problemCount}`);
    console.log(`   - Question records backfilled: ${questionCount}`);
    console.log(`   - Exam records backfilled: ${examCount}`);
    console.log('\n⚠️  NEXT STEPS:');
    console.log('   1. Review this migration summary for any unexpected values');
    console.log('   2. Run integration tests to verify all queries still work');
    console.log('   3. Monitor application logs for any issues');
    console.log('   4. After verification, proceed with backend code refactoring');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prismaAny.$disconnect();
  }
}

// Run the migration
migrateUserRolesToSubtables();
