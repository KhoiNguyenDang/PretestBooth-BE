-- Allow multiple attempts per user for PRACTICE exams by removing the global examId+userId uniqueness.
-- EXAM one-attempt behavior remains enforced in application service logic.
ALTER TABLE "ExamSession"
DROP CONSTRAINT IF EXISTS "ExamSession_examId_userId_key";

DROP INDEX IF EXISTS "ExamSession_examId_userId_key";

CREATE INDEX IF NOT EXISTS "ExamSession_examId_userId_idx"
ON "ExamSession"("examId", "userId");
