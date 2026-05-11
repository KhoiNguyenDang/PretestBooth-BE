-- Hard drop legacy duplicated student profile and lecturer metadata structures
DROP VIEW IF EXISTS "View_User_Student";
DROP VIEW IF EXISTS "View_User_Lecturer";

ALTER TABLE "User" DROP COLUMN IF EXISTS "studentCode";

DROP TABLE IF EXISTS "UserProfile" CASCADE;
DROP TABLE IF EXISTS "LecturerMetadata" CASCADE;
