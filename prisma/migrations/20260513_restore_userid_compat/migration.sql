-- Restore compatibility userId columns for operational tables.
-- This keeps current services working while studentId-based ownership remains available.

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ExamSession" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "PracticeSession" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "BookingCheckinAttempt" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "PointTransaction" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Backfill Booking.userId from Student.userId.
UPDATE "Booking" b
SET "userId" = s."userId"
FROM "Student" s
WHERE b."studentId" = s."id"
  AND b."userId" IS NULL;

-- Backfill ExamSession.userId from Student first, then Booking fallback.
UPDATE "ExamSession" es
SET "userId" = s."userId"
FROM "Student" s
WHERE es."studentId" = s."id"
  AND es."userId" IS NULL;

UPDATE "ExamSession" es
SET "userId" = b."userId"
FROM "Booking" b
WHERE es."bookingId" = b."id"
  AND es."userId" IS NULL
  AND b."userId" IS NOT NULL;

-- Backfill PracticeSession.userId from Student first, then Booking fallback.
UPDATE "PracticeSession" ps
SET "userId" = s."userId"
FROM "Student" s
WHERE ps."studentId" = s."id"
  AND ps."userId" IS NULL;

UPDATE "PracticeSession" ps
SET "userId" = b."userId"
FROM "Booking" b
WHERE ps."bookingId" = b."id"
  AND ps."userId" IS NULL
  AND b."userId" IS NOT NULL;

-- Backfill BookingCheckinAttempt.userId from Student first, then Booking fallback.
UPDATE "BookingCheckinAttempt" bca
SET "userId" = s."userId"
FROM "Student" s
WHERE bca."studentId" = s."id"
  AND bca."userId" IS NULL;

UPDATE "BookingCheckinAttempt" bca
SET "userId" = b."userId"
FROM "Booking" b
WHERE bca."bookingId" = b."id"
  AND bca."userId" IS NULL
  AND b."userId" IS NOT NULL;

-- Backfill PointTransaction.userId from Student first, then session/booking fallbacks.
UPDATE "PointTransaction" pt
SET "userId" = s."userId"
FROM "Student" s
WHERE pt."studentId" = s."id"
  AND pt."userId" IS NULL;

UPDATE "PointTransaction" pt
SET "userId" = es."userId"
FROM "ExamSession" es
WHERE pt."examSessionId" = es."id"
  AND pt."userId" IS NULL
  AND es."userId" IS NOT NULL;

UPDATE "PointTransaction" pt
SET "userId" = b."userId"
FROM "Booking" b
WHERE pt."bookingId" = b."id"
  AND pt."userId" IS NULL
  AND b."userId" IS NOT NULL;

-- Enforce NOT NULL to match current Prisma schema.
ALTER TABLE "Booking" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ExamSession" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PracticeSession" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "BookingCheckinAttempt" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "PointTransaction" ALTER COLUMN "userId" SET NOT NULL;

-- Recreate FKs and indexes where missing.
ALTER TABLE "Booking" DROP CONSTRAINT IF EXISTS "Booking_userId_fkey";
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamSession" DROP CONSTRAINT IF EXISTS "ExamSession_userId_fkey";
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeSession" DROP CONSTRAINT IF EXISTS "PracticeSession_userId_fkey";
ALTER TABLE "PracticeSession" ADD CONSTRAINT "PracticeSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingCheckinAttempt" DROP CONSTRAINT IF EXISTS "BookingCheckinAttempt_userId_fkey";
ALTER TABLE "BookingCheckinAttempt" ADD CONSTRAINT "BookingCheckinAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PointTransaction" DROP CONSTRAINT IF EXISTS "PointTransaction_userId_fkey";
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Booking_userId_idx" ON "Booking"("userId");
CREATE INDEX IF NOT EXISTS "ExamSession_userId_idx" ON "ExamSession"("userId");
CREATE INDEX IF NOT EXISTS "PracticeSession_userId_idx" ON "PracticeSession"("userId");
CREATE INDEX IF NOT EXISTS "BookingCheckinAttempt_userId_idx" ON "BookingCheckinAttempt"("userId");
CREATE INDEX IF NOT EXISTS "PointTransaction_userId_idx" ON "PointTransaction"("userId");
