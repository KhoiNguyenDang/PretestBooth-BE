-- CreateEnum for existing types (if not exists - Prisma handles this)
-- Migration: Add Student and Lecturer tables for role-based schema refactoring

-- Step 1: Create Student table
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "studentCode" TEXT UNIQUE,
    "className" TEXT,
    "dateOfBirth" DATE,
    "studentCardImageUrl" TEXT,
    "studentCardVerifiedAt" TIMESTAMP(3),
    "studentCardFaceMatchScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Student_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create indexes for Student table
CREATE INDEX "Student_userId_idx" ON "Student"("userId");
CREATE INDEX "Student_studentCode_idx" ON "Student"("studentCode");

-- Step 2: Create Lecturer table
CREATE TABLE "Lecturer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL UNIQUE,
    "lecturerRoleId" TEXT,
    "lecturerRoleAssignedAt" TIMESTAMP(3),
    "lecturerRoleAssignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lecturer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "Lecturer_lecturerRoleId_fkey" FOREIGN KEY ("lecturerRoleId") REFERENCES "LecturerRole" ("id") ON DELETE SET NULL,
    CONSTRAINT "Lecturer_lecturerRoleAssignedByUserId_fkey" FOREIGN KEY ("lecturerRoleAssignedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL
);

-- Create indexes for Lecturer table
CREATE INDEX "Lecturer_userId_idx" ON "Lecturer"("userId");
CREATE INDEX "Lecturer_lecturerRoleId_idx" ON "Lecturer"("lecturerRoleId");
CREATE INDEX "Lecturer_lecturerRoleAssignedByUserId_idx" ON "Lecturer"("lecturerRoleAssignedByUserId");

-- Step 3: Add dual FK columns to dependent tables

-- Add studentId to Booking
ALTER TABLE "Booking" ADD COLUMN "studentId" TEXT;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL;
CREATE INDEX "Booking_studentId_idx" ON "Booking"("studentId");

-- Add lecturerId to Problem
ALTER TABLE "Problem" ADD COLUMN "lecturerId" TEXT;
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "Lecturer" ("id") ON DELETE SET NULL;
CREATE INDEX "Problem_lecturerId_idx" ON "Problem"("lecturerId");

-- Add lecturerId to Question
ALTER TABLE "Question" ADD COLUMN "lecturerId" TEXT;
ALTER TABLE "Question" ADD CONSTRAINT "Question_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "Lecturer" ("id") ON DELETE SET NULL;
CREATE INDEX "Question_lecturerId_idx" ON "Question"("lecturerId");

-- Add lecturerId to Exam
ALTER TABLE "Exam" ADD COLUMN "lecturerId" TEXT;
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "Lecturer" ("id") ON DELETE SET NULL;
CREATE INDEX "Exam_lecturerId_idx" ON "Exam"("lecturerId");

-- Add studentId to ExamSession
ALTER TABLE "ExamSession" ADD COLUMN "studentId" TEXT;
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL;
CREATE INDEX "ExamSession_studentId_idx" ON "ExamSession"("studentId");

-- Add studentId to Submission
ALTER TABLE "Submission" ADD COLUMN "studentId" TEXT;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL;
CREATE INDEX "Submission_studentId_idx" ON "Submission"("studentId");

-- Add studentId to PracticeSession
ALTER TABLE "PracticeSession" ADD COLUMN "studentId" TEXT;
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL;
CREATE INDEX "PracticeSession_studentId_idx" ON "PracticeSession"("studentId");

-- Add studentId to BookingCheckinAttempt
ALTER TABLE "BookingCheckinAttempt" ADD COLUMN "studentId" TEXT;
ALTER TABLE "BookingCheckinAttempt" ADD CONSTRAINT "BookingCheckinAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL;
CREATE INDEX "BookingCheckinAttempt_studentId_idx" ON "BookingCheckinAttempt"("studentId");

-- Add studentId to PointTransaction
ALTER TABLE "PointTransaction" ADD COLUMN "studentId" TEXT;
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL;
CREATE INDEX "PointTransaction_studentId_idx" ON "PointTransaction"("studentId");

-- Add lecturerId to QuestionReviewAction
ALTER TABLE "QuestionReviewAction" ADD COLUMN "lecturerId" TEXT;
ALTER TABLE "QuestionReviewAction" ADD CONSTRAINT "QuestionReviewAction_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "Lecturer" ("id") ON DELETE SET NULL;
CREATE INDEX "QuestionReviewAction_lecturerId_idx" ON "QuestionReviewAction"("lecturerId");

-- Update LecturerRole to reference Lecturer instead of just User (for new Lecturer table)
-- Note: LecturerMetadata.metadataEntries relation already uses LecturerRole
-- We keep LecturerMetadata for backward compatibility, but Lecturer becomes primary table

-- Update LecturerPermissionAssignment to optionally reference Lecturer
-- This is handled through the new relation in Lecturer model

-- Step 4: Create transition views for backward compatibility

-- View for querying students through User interface
CREATE VIEW "View_User_Student" AS
SELECT 
  u."id",
  u."email",
  u."name",
  u."studentCode",
  u."role",
  u."createdAt",
  u."updatedAt",
  s."id" as "studentId",
  s."className",
  s."dateOfBirth",
  s."studentCardImageUrl",
  s."studentCardVerifiedAt"
FROM "User" u
LEFT JOIN "Student" s ON u."id" = s."userId"
WHERE u."role" = 'STUDENT' OR s."id" IS NOT NULL;

-- View for querying lecturers through User interface
CREATE VIEW "View_User_Lecturer" AS
SELECT 
  u."id",
  u."email",
  u."name",
  u."role",
  u."createdAt",
  u."updatedAt",
  l."id" as "lecturerId",
  l."lecturerRoleId",
  l."lecturerRoleAssignedAt",
  l."lecturerRoleAssignedByUserId"
FROM "User" u
LEFT JOIN "Lecturer" l ON u."id" = l."userId"
WHERE u."role" = 'LECTURER' OR l."id" IS NOT NULL;
