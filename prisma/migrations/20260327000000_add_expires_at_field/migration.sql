-- Add expiresAt field to track session deadline (startedAt + exam.duration)
ALTER TABLE "ExamSession"
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create index for efficient deadline queries
CREATE INDEX "ExamSession_expiresAt_idx" ON "ExamSession"("expiresAt");

-- Update existing sessions: calculate expiresAt from startedAt + related exam duration
-- This is a one-time backfill; future sessions will set expiresAt on creation
UPDATE "ExamSession" es
SET "expiresAt" = es."startedAt" + INTERVAL '1 minute' * COALESCE(e."duration", 60)
FROM "Exam" e
WHERE es."examId" = e."id";
