-- Remove booth session time-based expiration fields
DROP INDEX IF EXISTS "Booth_sessionExpiresAt_idx";

ALTER TABLE "Booth"
DROP COLUMN IF EXISTS "sessionExpiresAt",
DROP COLUMN IF EXISTS "sessionEndAt";
