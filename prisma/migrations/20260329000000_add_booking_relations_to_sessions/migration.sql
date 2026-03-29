-- Add bookingId reference to track which booking spawned each session
-- This allows different proctoring handling for EXAM vs PRACTICE sessions

ALTER TABLE "ExamSession"
ADD COLUMN "bookingId" TEXT;

ALTER TABLE "PracticeSession"
ADD COLUMN "bookingId" TEXT;

-- Remove old direct references (not using foreign keys, just was storing IDs)
ALTER TABLE "Booking"
DROP COLUMN IF EXISTS "examSessionId",
DROP COLUMN IF EXISTS "practiceSessionId";

-- Create indexes for efficient lookups
CREATE INDEX "ExamSession_bookingId_idx" ON "ExamSession"("bookingId");
CREATE INDEX "PracticeSession_bookingId_idx" ON "PracticeSession"("bookingId");

-- Add foreign key constraints
ALTER TABLE "ExamSession"
ADD CONSTRAINT "ExamSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PracticeSession"
ADD CONSTRAINT "PracticeSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
