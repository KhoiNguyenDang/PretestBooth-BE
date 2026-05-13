-- Add new student/lecturer operation relations and FKs

-- 1. PointAccount: add studentId FK (optional initially)
ALTER TABLE "PointAccount" 
ADD COLUMN "studentId" TEXT;

ALTER TABLE "PointAccount"
ADD CONSTRAINT "PointAccount_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PointAccount_studentId_key" ON "PointAccount"("studentId");
CREATE INDEX IF NOT EXISTS "PointAccount_studentId_idx" ON "PointAccount"("studentId");

-- 2. ProctoringEvent: add studentId FK (optional)
ALTER TABLE "ProctoringEvent"
ADD COLUMN "studentId" TEXT;

ALTER TABLE "ProctoringEvent"
ADD CONSTRAINT "ProctoringEvent_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ProctoringEvent_studentId_idx" ON "ProctoringEvent"("studentId");

-- 3. QuestionReviewSession: add lecturerId FK (optional)
ALTER TABLE "QuestionReviewSession"
ADD COLUMN "lecturerId" TEXT;

ALTER TABLE "QuestionReviewSession"
ADD CONSTRAINT "QuestionReviewSession_lecturerId_fkey"
FOREIGN KEY ("lecturerId") REFERENCES "Lecturer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "QuestionReviewSession_lecturerId_idx" ON "QuestionReviewSession"("lecturerId");

-- 4. Make Submission.user optional (for backward compat / audit)
ALTER TABLE "Submission"
ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "Submission"
DROP CONSTRAINT IF EXISTS "Submission_userId_fkey";

ALTER TABLE "Submission"
ADD CONSTRAINT "Submission_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
