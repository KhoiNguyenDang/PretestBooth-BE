-- Add direct user reference for faster violation lookups
ALTER TABLE "ProctoringEvent"
ADD COLUMN IF NOT EXISTS "userId" TEXT;

ALTER TABLE "ProctoringEvent"
ADD CONSTRAINT "ProctoringEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "ProctoringEvent_userId_idx" ON "ProctoringEvent"("userId");
