-- Drop duplicate legacy identity columns and tables removed from Prisma schema
DROP VIEW IF EXISTS "View_User_Student";
DROP VIEW IF EXISTS "View_User_Lecturer";

ALTER TABLE "User" DROP COLUMN IF EXISTS "studentCode";

DROP TABLE IF EXISTS "UserProfile";
DROP TABLE IF EXISTS "LecturerMetadata";

-- Drop legacy auth fields (moved to UserAuth table)
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";
ALTER TABLE "User" DROP COLUMN IF EXISTS "refreshToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerificationToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "emailVerificationExpiry";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetPasswordCode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "resetPasswordExpiry";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isEmailVerified";
ALTER TABLE "User" DROP COLUMN IF EXISTS "isAccountLocked";
ALTER TABLE "User" DROP COLUMN IF EXISTS "accountLockedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "accountLockedReason";

-- Drop legacy profile fields (moved to UserProfile table)
ALTER TABLE "User" DROP COLUMN IF EXISTS "dateOfBirth";
ALTER TABLE "User" DROP COLUMN IF EXISTS "className";

-- Drop legacy KYC fields (moved to UserKyc and UserProfile tables)
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycStatus";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycRegisteredAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycVerifiedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycLastAttemptAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycFaceImageUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycStudentImageUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewStatus";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewRequestedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewRequestedReason";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewReviewedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewedByUserId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewRejectionReason";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycManualReviewNotes";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycConsentVersion";
ALTER TABLE "User" DROP COLUMN IF EXISTS "kycConsentedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "studentCardImageUrl";
ALTER TABLE "User" DROP COLUMN IF EXISTS "studentCardVerifiedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "studentCardFaceMatchScore";

-- Drop legacy lecturer fields (moved to LecturerMetadata table)
ALTER TABLE "User" DROP COLUMN IF EXISTS "lecturerRoleId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lecturerRoleAssignedAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "lecturerRoleAssignedByUserId";

-- Drop legacy face embedding fields (moved to UserFaceEmbedding table)
ALTER TABLE "User" DROP COLUMN IF EXISTS "faceEmbedding";
ALTER TABLE "User" DROP COLUMN IF EXISTS "faceEmbeddingModel";
ALTER TABLE "User" DROP COLUMN IF EXISTS "faceEmbeddingVersion";
ALTER TABLE "User" DROP COLUMN IF EXISTS "faceEmbeddingNorm";
ALTER TABLE "User" DROP COLUMN IF EXISTS "faceEmbeddingUpdatedAt";

-- Drop legacy points field (moved to PointAccount table)
ALTER TABLE "User" DROP COLUMN IF EXISTS "totalPoints";

-- Drop legacy indexes that reference dropped columns
DROP INDEX IF EXISTS "User_studentCode_key";
DROP INDEX IF EXISTS "User_kycStatus_idx";
DROP INDEX IF EXISTS "User_kycManualReviewStatus_idx";
DROP INDEX IF EXISTS "User_kycManualReviewRequestedAt_idx";
DROP INDEX IF EXISTS "User_kycManualReviewReviewedAt_idx";
DROP INDEX IF EXISTS "User_lecturerRoleId_idx";
DROP INDEX IF EXISTS "User_lecturerRoleAssignedByUserId_idx";
