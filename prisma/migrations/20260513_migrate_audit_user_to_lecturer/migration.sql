-- Migrate audit actor columns from User-based IDs to Lecturer IDs

-- 1) Add new lecturer-based columns
ALTER TABLE "UserKyc" ADD COLUMN IF NOT EXISTS "kycManualReviewedByLecturerId" TEXT;
ALTER TABLE "Lecturer" ADD COLUMN IF NOT EXISTS "lecturerRoleAssignedByLecturerId" TEXT;
ALTER TABLE "LecturerPermissionAssignment" ADD COLUMN IF NOT EXISTS "grantedByLecturerId" TEXT;
ALTER TABLE "LecturerRole" ADD COLUMN IF NOT EXISTS "createdByLecturerId" TEXT;
ALTER TABLE "ExamSessionAnswer" ADD COLUMN IF NOT EXISTS "reviewedByLecturerId" TEXT;
ALTER TABLE "ExamSessionGradeAudit" ADD COLUMN IF NOT EXISTS "actorLecturerId" TEXT;
ALTER TABLE "BoothStatusLog" ADD COLUMN IF NOT EXISTS "changedByLecturerId" TEXT;
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "updatedByLecturerId" TEXT;

-- 2) Ensure every ADMIN has a Lecturer profile for mapping
INSERT INTO "Lecturer" ("id", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), u."id", now(), now()
FROM "User" u
LEFT JOIN "Lecturer" l ON l."userId" = u."id"
WHERE u."role" = 'ADMIN' AND l."id" IS NULL;

-- 3) Backfill via UserId -> Lecturer.userId
UPDATE "UserKyc" uk
SET "kycManualReviewedByLecturerId" = l."id"
FROM "Lecturer" l
WHERE uk."kycManualReviewedByUserId" = l."userId"
  AND uk."kycManualReviewedByUserId" IS NOT NULL
  AND uk."kycManualReviewedByLecturerId" IS NULL;

UPDATE "Lecturer" ltarget
SET "lecturerRoleAssignedByLecturerId" = lsrc."id"
FROM "Lecturer" lsrc
WHERE ltarget."lecturerRoleAssignedByUserId" = lsrc."userId"
  AND ltarget."lecturerRoleAssignedByUserId" IS NOT NULL
  AND ltarget."lecturerRoleAssignedByLecturerId" IS NULL;

UPDATE "LecturerPermissionAssignment" lpa
SET "grantedByLecturerId" = l."id"
FROM "Lecturer" l
WHERE lpa."grantedByUserId" = l."userId"
  AND lpa."grantedByUserId" IS NOT NULL
  AND lpa."grantedByLecturerId" IS NULL;

UPDATE "LecturerRole" lr
SET "createdByLecturerId" = l."id"
FROM "Lecturer" l
WHERE lr."createdByUserId" = l."userId"
  AND lr."createdByUserId" IS NOT NULL
  AND lr."createdByLecturerId" IS NULL;

UPDATE "ExamSessionAnswer" esa
SET "reviewedByLecturerId" = l."id"
FROM "Lecturer" l
WHERE esa."reviewedByUserId" = l."userId"
  AND esa."reviewedByUserId" IS NOT NULL
  AND esa."reviewedByLecturerId" IS NULL;

UPDATE "ExamSessionGradeAudit" esga
SET "actorLecturerId" = l."id"
FROM "Lecturer" l
WHERE esga."actorUserId" = l."userId"
  AND esga."actorUserId" IS NOT NULL
  AND esga."actorLecturerId" IS NULL;

UPDATE "BoothStatusLog" bsl
SET "changedByLecturerId" = l."id"
FROM "Lecturer" l
WHERE bsl."changedByUserId" = l."userId"
  AND bsl."changedByUserId" IS NOT NULL
  AND bsl."changedByLecturerId" IS NULL;

UPDATE "SystemSetting" ss
SET "updatedByLecturerId" = l."id"
FROM "Lecturer" l
WHERE ss."updatedByUserId" = l."userId"
  AND ss."updatedByUserId" IS NOT NULL
  AND ss."updatedByLecturerId" IS NULL;

-- 4) Add new FKs + indexes
ALTER TABLE "UserKyc" ADD CONSTRAINT "UserKyc_kycManualReviewedByLecturerId_fkey"
  FOREIGN KEY ("kycManualReviewedByLecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "UserKyc_kycManualReviewedByLecturerId_idx" ON "UserKyc"("kycManualReviewedByLecturerId");

ALTER TABLE "Lecturer" ADD CONSTRAINT "Lecturer_lecturerRoleAssignedByLecturerId_fkey"
  FOREIGN KEY ("lecturerRoleAssignedByLecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Lecturer_lecturerRoleAssignedByLecturerId_idx" ON "Lecturer"("lecturerRoleAssignedByLecturerId");

ALTER TABLE "LecturerPermissionAssignment" ADD CONSTRAINT "LecturerPermissionAssignment_grantedByLecturerId_fkey"
  FOREIGN KEY ("grantedByLecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "LecturerPermissionAssignment_grantedByLecturerId_idx" ON "LecturerPermissionAssignment"("grantedByLecturerId");

ALTER TABLE "LecturerRole" ADD CONSTRAINT "LecturerRole_createdByLecturerId_fkey"
  FOREIGN KEY ("createdByLecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "LecturerRole_createdByLecturerId_idx" ON "LecturerRole"("createdByLecturerId");

CREATE INDEX IF NOT EXISTS "ExamSessionAnswer_reviewedByLecturerId_idx" ON "ExamSessionAnswer"("reviewedByLecturerId");
CREATE INDEX IF NOT EXISTS "ExamSessionGradeAudit_actorLecturerId_idx" ON "ExamSessionGradeAudit"("actorLecturerId");

ALTER TABLE "BoothStatusLog" ADD CONSTRAINT "BoothStatusLog_changedByLecturerId_fkey"
  FOREIGN KEY ("changedByLecturerId") REFERENCES "Lecturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "BoothStatusLog_changedByLecturerId_idx" ON "BoothStatusLog"("changedByLecturerId");

CREATE INDEX IF NOT EXISTS "SystemSetting_updatedByLecturerId_idx" ON "SystemSetting"("updatedByLecturerId");

-- 5) Drop old FKs, indexes, and columns
ALTER TABLE "UserKyc" DROP CONSTRAINT IF EXISTS "UserKyc_kycManualReviewedByUserId_fkey";
DROP INDEX IF EXISTS "UserKyc_kycManualReviewedByUserId_idx";
ALTER TABLE "UserKyc" DROP COLUMN IF EXISTS "kycManualReviewedByUserId";

ALTER TABLE "Lecturer" DROP CONSTRAINT IF EXISTS "Lecturer_lecturerRoleAssignedByUserId_fkey";
DROP INDEX IF EXISTS "Lecturer_lecturerRoleAssignedByUserId_idx";
ALTER TABLE "Lecturer" DROP COLUMN IF EXISTS "lecturerRoleAssignedByUserId";

ALTER TABLE "LecturerPermissionAssignment" DROP CONSTRAINT IF EXISTS "LecturerPermissionAssignment_grantedByUserId_fkey";
DROP INDEX IF EXISTS "LecturerPermissionAssignment_grantedByUserId_idx";
ALTER TABLE "LecturerPermissionAssignment" DROP COLUMN IF EXISTS "grantedByUserId";

ALTER TABLE "LecturerRole" DROP CONSTRAINT IF EXISTS "LecturerRole_createdByUserId_fkey";
DROP INDEX IF EXISTS "LecturerRole_createdByUserId_idx";
ALTER TABLE "LecturerRole" DROP COLUMN IF EXISTS "createdByUserId";

DROP INDEX IF EXISTS "ExamSessionAnswer_reviewedByUserId_idx";
ALTER TABLE "ExamSessionAnswer" DROP COLUMN IF EXISTS "reviewedByUserId";

DROP INDEX IF EXISTS "ExamSessionGradeAudit_actorUserId_idx";
ALTER TABLE "ExamSessionGradeAudit" DROP COLUMN IF EXISTS "actorUserId";

ALTER TABLE "BoothStatusLog" DROP CONSTRAINT IF EXISTS "BoothStatusLog_changedByUserId_fkey";
DROP INDEX IF EXISTS "BoothStatusLog_changedByUserId_idx";
ALTER TABLE "BoothStatusLog" DROP COLUMN IF EXISTS "changedByUserId";

DROP INDEX IF EXISTS "SystemSetting_updatedByUserId_idx";
ALTER TABLE "SystemSetting" DROP COLUMN IF EXISTS "updatedByUserId";
