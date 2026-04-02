-- Lecturer-level granular permissions for delegated administration.
CREATE TYPE "LecturerPermission" AS ENUM (
  'CREATE_EXAM',
  'REVIEW_QUESTION',
  'MANAGE_QUESTION_BANK',
  'MANAGE_STUDENTS',
  'MANAGE_BOOTHS',
  'LECTURER_ADMIN'
);

CREATE TABLE "LecturerPermissionAssignment" (
  "id" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "permission" "LecturerPermission" NOT NULL,
  "grantedByUserId" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturerPermissionAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LecturerPermissionAssignment_lecturerId_permission_key"
  ON "LecturerPermissionAssignment"("lecturerId", "permission");
CREATE INDEX "LecturerPermissionAssignment_lecturerId_idx"
  ON "LecturerPermissionAssignment"("lecturerId");
CREATE INDEX "LecturerPermissionAssignment_permission_idx"
  ON "LecturerPermissionAssignment"("permission");
CREATE INDEX "LecturerPermissionAssignment_grantedByUserId_idx"
  ON "LecturerPermissionAssignment"("grantedByUserId");

ALTER TABLE "LecturerPermissionAssignment"
  ADD CONSTRAINT "LecturerPermissionAssignment_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LecturerPermissionAssignment"
  ADD CONSTRAINT "LecturerPermissionAssignment_grantedByUserId_fkey"
  FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
