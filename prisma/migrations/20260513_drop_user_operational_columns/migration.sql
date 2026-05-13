-- Drop operational userId columns - consolidate to role-based tables

-- 1. ExamSession: drop userId (use studentId only)
ALTER TABLE "ExamSession"
DROP CONSTRAINT IF EXISTS "ExamSession_userId_fkey";

ALTER TABLE "ExamSession"
DROP COLUMN "userId";

-- 2. Booking: drop userId (use studentId only)
ALTER TABLE "Booking"
DROP CONSTRAINT IF EXISTS "Booking_userId_fkey";

ALTER TABLE "Booking"
DROP COLUMN "userId";

-- 3. BookingCheckinAttempt: drop userId (use studentId only)
ALTER TABLE "BookingCheckinAttempt"
DROP CONSTRAINT IF EXISTS "BookingCheckinAttempt_userId_fkey";

ALTER TABLE "BookingCheckinAttempt"
DROP COLUMN "userId";

-- 4. PointTransaction: drop userId (use studentId only)
ALTER TABLE "PointTransaction"
DROP CONSTRAINT IF EXISTS "PointTransaction_userId_fkey";

ALTER TABLE "PointTransaction"
DROP COLUMN "userId";

-- 5. PracticeSession: drop userId (use studentId only)
ALTER TABLE "PracticeSession"
DROP CONSTRAINT IF EXISTS "PracticeSession_userId_fkey";

ALTER TABLE "PracticeSession"
DROP COLUMN "userId";

-- 6. ProctoringEvent: drop userId (use studentId only)
ALTER TABLE "ProctoringEvent"
DROP CONSTRAINT IF EXISTS "ProctoringEvent_userId_fkey";

ALTER TABLE "ProctoringEvent"
DROP COLUMN "userId";

-- 7. PointAccount: drop userId and make studentId required
ALTER TABLE "PointAccount"
DROP CONSTRAINT IF EXISTS "PointAccount_userId_fkey";

DROP INDEX IF EXISTS "PointAccount_userId_key";
DROP INDEX IF EXISTS "PointAccount_userId_idx";

ALTER TABLE "PointAccount"
DROP COLUMN "userId";

-- Ensure all PointAccount records have a studentId before adding constraint
ALTER TABLE "PointAccount"
ALTER COLUMN "studentId" SET NOT NULL;
