-- Update ProctoringEvent to support both EXAM and PRACTICE sessions
-- Remove old sessionId foreign key and add optional references

-- Remove old sessionId column and constraint
ALTER TABLE "ProctoringEvent"
DROP CONSTRAINT IF EXISTS "ProctoringEvent_sessionId_fkey",
DROP COLUMN IF EXISTS "sessionId";

-- Add new optional columns for exam and practice sessions
ALTER TABLE "ProctoringEvent"
ADD COLUMN "examSessionId" TEXT,
ADD COLUMN "practiceSessionId" TEXT;

-- Add foreign key constraints
ALTER TABLE "ProctoringEvent"
ADD CONSTRAINT "ProctoringEvent_examSessionId_fkey" 
  FOREIGN KEY ("examSessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "ProctoringEvent_practiceSessionId_fkey" 
  FOREIGN KEY ("practiceSessionId") REFERENCES "PracticeSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes
CREATE INDEX "ProctoringEvent_examSessionId_idx" ON "ProctoringEvent"("examSessionId");
CREATE INDEX "ProctoringEvent_practiceSessionId_idx" ON "ProctoringEvent"("practiceSessionId");

-- Drop old index if it exists
DROP INDEX IF EXISTS "ProctoringEvent_sessionId_idx";
