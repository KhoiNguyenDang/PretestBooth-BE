-- Remove deprecated lock flag from lecturer roles
ALTER TABLE "LecturerRole"
  DROP COLUMN IF EXISTS "isSystemLocked";
