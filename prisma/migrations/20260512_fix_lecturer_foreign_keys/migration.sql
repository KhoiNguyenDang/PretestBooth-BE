-- Restore missing foreign keys for lecturer domain tables.
-- These relations exist in Prisma schema but were not present in the live database.

ALTER TABLE "Lecturer"
  ADD CONSTRAINT "Lecturer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Lecturer"
  ADD CONSTRAINT "Lecturer_lecturerRoleId_fkey"
  FOREIGN KEY ("lecturerRoleId") REFERENCES "LecturerRole"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lecturer"
  ADD CONSTRAINT "Lecturer_lecturerRoleAssignedByUserId_fkey"
  FOREIGN KEY ("lecturerRoleAssignedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Problem"
  ADD CONSTRAINT "Problem_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Exam"
  ADD CONSTRAINT "Exam_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuestionReviewAction"
  ADD CONSTRAINT "QuestionReviewAction_lecturerId_fkey"
  FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
