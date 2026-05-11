-- Move lecturer permission ownership from User to Lecturer.
-- Existing LecturerPermissionAssignment.lecturerId values currently store User.id.

ALTER TABLE "LecturerPermissionAssignment"
  DROP CONSTRAINT IF EXISTS "LecturerPermissionAssignment_lecturerId_fkey";

UPDATE "LecturerPermissionAssignment" AS lpa
SET "lecturerId" = l."id"
FROM "Lecturer" AS l
WHERE l."userId" = lpa."lecturerId";

ALTER TABLE "LecturerPermissionAssignment"
  ADD CONSTRAINT "LecturerPermissionAssignment_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
