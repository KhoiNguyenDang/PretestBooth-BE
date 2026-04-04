DO $$
BEGIN
  CREATE TYPE "PretestAssignmentMode" AS ENUM ('QUESTION_BANK_RANDOM', 'OFFICIAL_EXAM_POOL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "PretestThresholdSource" AS ENUM ('PRETEST_CONFIG', 'EXAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "ExamSession"
  ADD COLUMN IF NOT EXISTS "isPretestSession" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pretestAttemptNumber" INTEGER,
  ADD COLUMN IF NOT EXISTS "pretestAssignmentMode" "PretestAssignmentMode",
  ADD COLUMN IF NOT EXISTS "pretestThresholdSource" "PretestThresholdSource",
  ADD COLUMN IF NOT EXISTS "pretestSourceExamId" TEXT,
  ADD COLUMN IF NOT EXISTS "appliedPassingScoreAbsolute" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "passed" BOOLEAN;

CREATE INDEX IF NOT EXISTS "ExamSession_userId_isPretestSession_idx"
  ON "ExamSession"("userId", "isPretestSession");

CREATE INDEX IF NOT EXISTS "ExamSession_bookingId_isPretestSession_idx"
  ON "ExamSession"("bookingId", "isPretestSession");
