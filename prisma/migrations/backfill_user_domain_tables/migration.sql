-- Create normalized user-domain tables if this database does not already have them.
CREATE TABLE IF NOT EXISTS "UserAuth" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "refreshToken" TEXT,
  "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "emailVerificationToken" TEXT,
  "emailVerificationExpiry" TIMESTAMP(3),
  "resetPasswordCode" TEXT,
  "resetPasswordExpiry" TIMESTAMP(3),
  "isLocked" BOOLEAN NOT NULL DEFAULT false,
  "lockedAt" TIMESTAMP(3),
  "lockedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAuth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserAuth_userId_key" ON "UserAuth"("userId");
CREATE INDEX IF NOT EXISTS "UserAuth_userId_idx" ON "UserAuth"("userId");
CREATE INDEX IF NOT EXISTS "UserAuth_isEmailVerified_idx" ON "UserAuth"("isEmailVerified");
CREATE INDEX IF NOT EXISTS "UserAuth_isLocked_idx" ON "UserAuth"("isLocked");

CREATE TABLE IF NOT EXISTS "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT,
  "studentCode" TEXT,
  "dateOfBirth" DATE,
  "className" TEXT,
  "studentCardImageUrl" TEXT,
  "studentCardVerifiedAt" TIMESTAMP(3),
  "studentCardFaceMatchScore" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_studentCode_key" ON "UserProfile"("studentCode");
CREATE INDEX IF NOT EXISTS "UserProfile_userId_idx" ON "UserProfile"("userId");
CREATE INDEX IF NOT EXISTS "UserProfile_studentCode_idx" ON "UserProfile"("studentCode");

CREATE TABLE IF NOT EXISTS "UserKyc" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "kycRegisteredAt" TIMESTAMP(3),
  "kycVerifiedAt" TIMESTAMP(3),
  "kycLastAttemptAt" TIMESTAMP(3),
  "kycFaceImageUrl" TEXT,
  "kycStudentImageUrl" TEXT,
  "kycManualReviewStatus" "KycManualReviewStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "kycManualReviewRequestedAt" TIMESTAMP(3),
  "kycManualReviewRequestedReason" TEXT,
  "kycManualReviewReviewedAt" TIMESTAMP(3),
  "kycManualReviewedByUserId" TEXT,
  "kycManualReviewRejectionReason" TEXT,
  "kycManualReviewNotes" TEXT,
  "kycConsentVersion" TEXT,
  "kycConsentedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserKyc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserKyc_userId_key" ON "UserKyc"("userId");
CREATE INDEX IF NOT EXISTS "UserKyc_userId_idx" ON "UserKyc"("userId");
CREATE INDEX IF NOT EXISTS "UserKyc_kycStatus_idx" ON "UserKyc"("kycStatus");
CREATE INDEX IF NOT EXISTS "UserKyc_kycManualReviewStatus_idx" ON "UserKyc"("kycManualReviewStatus");
CREATE INDEX IF NOT EXISTS "UserKyc_kycManualReviewedByUserId_idx" ON "UserKyc"("kycManualReviewedByUserId");

CREATE TABLE IF NOT EXISTS "UserFaceEmbedding" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "faceEmbedding" JSONB,
  "faceEmbeddingModel" TEXT,
  "faceEmbeddingVersion" TEXT,
  "faceEmbeddingNorm" DOUBLE PRECISION,
  "faceEmbeddingUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserFaceEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserFaceEmbedding_userId_key" ON "UserFaceEmbedding"("userId");
CREATE INDEX IF NOT EXISTS "UserFaceEmbedding_userId_idx" ON "UserFaceEmbedding"("userId");

CREATE TABLE IF NOT EXISTS "LecturerMetadata" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lecturerRoleId" TEXT,
  "lecturerRoleAssignedAt" TIMESTAMP(3),
  "lecturerRoleAssignedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LecturerMetadata_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LecturerMetadata_userId_key" ON "LecturerMetadata"("userId");
CREATE INDEX IF NOT EXISTS "LecturerMetadata_userId_idx" ON "LecturerMetadata"("userId");
CREATE INDEX IF NOT EXISTS "LecturerMetadata_lecturerRoleId_idx" ON "LecturerMetadata"("lecturerRoleId");
CREATE INDEX IF NOT EXISTS "LecturerMetadata_lecturerRoleAssignedByUserId_idx" ON "LecturerMetadata"("lecturerRoleAssignedByUserId");

CREATE TABLE IF NOT EXISTS "PointAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "totalPoints" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PointAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PointAccount_userId_key" ON "PointAccount"("userId");
CREATE INDEX IF NOT EXISTS "PointAccount_userId_idx" ON "PointAccount"("userId");

ALTER TABLE "UserAuth"
  ADD CONSTRAINT "UserAuth_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProfile"
  ADD CONSTRAINT "UserProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserKyc"
  ADD CONSTRAINT "UserKyc_reviewedByUserId_fkey"
  FOREIGN KEY ("kycManualReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserKyc"
  ADD CONSTRAINT "UserKyc_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserFaceEmbedding"
  ADD CONSTRAINT "UserFaceEmbedding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LecturerMetadata"
  ADD CONSTRAINT "LecturerMetadata_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LecturerMetadata"
  ADD CONSTRAINT "LecturerMetadata_lecturerRoleId_fkey"
  FOREIGN KEY ("lecturerRoleId") REFERENCES "LecturerRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LecturerMetadata"
  ADD CONSTRAINT "LecturerMetadata_assignedByUserId_fkey"
  FOREIGN KEY ("lecturerRoleAssignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PointAccount"
  ADD CONSTRAINT "PointAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill UserAuth table with existing User auth data.
INSERT INTO "UserAuth" ("id", "userId", "password", "refreshToken", "isEmailVerified", "emailVerificationToken", "emailVerificationExpiry", "resetPasswordCode", "resetPasswordExpiry", "isLocked", "lockedAt", "lockedReason", "createdAt", "updatedAt")
SELECT 
  u."id",
  u."id",
  u."password",
  u."refreshToken",
  u."isEmailVerified",
  u."emailVerificationToken",
  u."emailVerificationExpiry",
  u."resetPasswordCode",
  u."resetPasswordExpiry",
  u."isLocked",
  u."lockedAt",
  u."lockedReason",
  COALESCE(u."createdAt", NOW()),
  COALESCE(u."updatedAt", NOW())
FROM "User" u
WHERE u."role" IN ('STUDENT', 'LECTURER', 'ADMIN')
ON CONFLICT ("userId") DO UPDATE
SET
  "password" = EXCLUDED."password",
  "refreshToken" = EXCLUDED."refreshToken",
  "isEmailVerified" = EXCLUDED."isEmailVerified",
  "emailVerificationToken" = EXCLUDED."emailVerificationToken",
  "emailVerificationExpiry" = EXCLUDED."emailVerificationExpiry",
  "resetPasswordCode" = EXCLUDED."resetPasswordCode",
  "resetPasswordExpiry" = EXCLUDED."resetPasswordExpiry",
  "isLocked" = EXCLUDED."isLocked",
  "lockedAt" = EXCLUDED."lockedAt",
  "lockedReason" = EXCLUDED."lockedReason",
  "updatedAt" = NOW();

-- Backfill UserProfile table with existing User profile data (students only).
INSERT INTO "UserProfile" ("id", "userId", "name", "studentCode", "dateOfBirth", "className", "studentCardImageUrl", "studentCardVerifiedAt", "studentCardFaceMatchScore", "createdAt", "updatedAt")
SELECT 
  u."id",
  u."id",
  u."name",
  u."studentCode",
  u."dateOfBirth",
  u."className",
  u."studentCardImageUrl",
  u."studentCardVerifiedAt",
  u."studentCardFaceMatchScore",
  COALESCE(u."createdAt", NOW()),
  COALESCE(u."updatedAt", NOW())
FROM "User" u
WHERE u."role" = 'STUDENT'
ON CONFLICT ("userId") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "studentCode" = EXCLUDED."studentCode",
  "dateOfBirth" = EXCLUDED."dateOfBirth",
  "className" = EXCLUDED."className",
  "studentCardImageUrl" = EXCLUDED."studentCardImageUrl",
  "studentCardVerifiedAt" = EXCLUDED."studentCardVerifiedAt",
  "studentCardFaceMatchScore" = EXCLUDED."studentCardFaceMatchScore",
  "updatedAt" = NOW();

-- Backfill UserKyc table with existing User KYC data (students only).
INSERT INTO "UserKyc" ("id", "userId", "kycStatus", "kycRegisteredAt", "kycVerifiedAt", "kycLastAttemptAt", "kycFaceImageUrl", "kycStudentImageUrl", "kycManualReviewStatus", "kycManualReviewRequestedAt", "kycManualReviewRequestedReason", "kycManualReviewReviewedAt", "kycManualReviewedByUserId", "kycManualReviewRejectionReason", "kycManualReviewNotes", "kycConsentVersion", "kycConsentedAt", "createdAt", "updatedAt")
SELECT 
  u."id",
  u."id",
  u."kycStatus",
  u."kycRegisteredAt",
  u."kycVerifiedAt",
  u."kycLastAttemptAt",
  u."kycFaceImageUrl",
  u."kycStudentImageUrl",
  u."kycManualReviewStatus",
  u."kycManualReviewRequestedAt",
  u."kycManualReviewRequestedReason",
  u."kycManualReviewReviewedAt",
  u."kycManualReviewedByUserId",
  u."kycManualReviewRejectionReason",
  u."kycManualReviewNotes",
  u."kycConsentVersion",
  u."kycConsentedAt",
  COALESCE(u."createdAt", NOW()),
  COALESCE(u."updatedAt", NOW())
FROM "User" u
WHERE u."role" = 'STUDENT'
ON CONFLICT ("userId") DO UPDATE
SET
  "kycStatus" = EXCLUDED."kycStatus",
  "kycRegisteredAt" = EXCLUDED."kycRegisteredAt",
  "kycVerifiedAt" = EXCLUDED."kycVerifiedAt",
  "kycLastAttemptAt" = EXCLUDED."kycLastAttemptAt",
  "kycFaceImageUrl" = EXCLUDED."kycFaceImageUrl",
  "kycStudentImageUrl" = EXCLUDED."kycStudentImageUrl",
  "kycManualReviewStatus" = EXCLUDED."kycManualReviewStatus",
  "kycManualReviewRequestedAt" = EXCLUDED."kycManualReviewRequestedAt",
  "kycManualReviewRequestedReason" = EXCLUDED."kycManualReviewRequestedReason",
  "kycManualReviewReviewedAt" = EXCLUDED."kycManualReviewReviewedAt",
  "kycManualReviewedByUserId" = EXCLUDED."kycManualReviewedByUserId",
  "kycManualReviewRejectionReason" = EXCLUDED."kycManualReviewRejectionReason",
  "kycManualReviewNotes" = EXCLUDED."kycManualReviewNotes",
  "kycConsentVersion" = EXCLUDED."kycConsentVersion",
  "kycConsentedAt" = EXCLUDED."kycConsentedAt",
  "updatedAt" = NOW();

-- Backfill UserFaceEmbedding table with existing User face embedding data.
INSERT INTO "UserFaceEmbedding" ("id", "userId", "faceEmbedding", "faceEmbeddingModel", "faceEmbeddingVersion", "faceEmbeddingNorm", "faceEmbeddingUpdatedAt", "createdAt", "updatedAt")
SELECT 
  u."id",
  u."id",
  u."faceEmbedding",
  u."faceEmbeddingModel",
  u."faceEmbeddingVersion",
  u."faceEmbeddingNorm",
  u."faceEmbeddingUpdatedAt",
  COALESCE(u."createdAt", NOW()),
  COALESCE(u."updatedAt", NOW())
FROM "User" u
WHERE u."faceEmbedding" IS NOT NULL
ON CONFLICT ("userId") DO UPDATE
SET
  "faceEmbedding" = EXCLUDED."faceEmbedding",
  "faceEmbeddingModel" = EXCLUDED."faceEmbeddingModel",
  "faceEmbeddingVersion" = EXCLUDED."faceEmbeddingVersion",
  "faceEmbeddingNorm" = EXCLUDED."faceEmbeddingNorm",
  "faceEmbeddingUpdatedAt" = EXCLUDED."faceEmbeddingUpdatedAt",
  "updatedAt" = NOW();

-- Backfill LecturerMetadata table with existing User lecturer data.
INSERT INTO "LecturerMetadata" ("id", "userId", "lecturerRoleId", "lecturerRoleAssignedAt", "lecturerRoleAssignedByUserId", "createdAt", "updatedAt")
SELECT 
  u."id",
  u."id",
  u."lecturerRoleId",
  u."lecturerRoleAssignedAt",
  u."lecturerRoleAssignedByUserId",
  COALESCE(u."createdAt", NOW()),
  COALESCE(u."updatedAt", NOW())
FROM "User" u
WHERE u."role" = 'LECTURER'
ON CONFLICT ("userId") DO UPDATE
SET
  "lecturerRoleId" = EXCLUDED."lecturerRoleId",
  "lecturerRoleAssignedAt" = EXCLUDED."lecturerRoleAssignedAt",
  "lecturerRoleAssignedByUserId" = EXCLUDED."lecturerRoleAssignedByUserId",
  "updatedAt" = NOW();

-- Backfill PointAccount table with existing User totalPoints data.
INSERT INTO "PointAccount" ("id", "userId", "totalPoints", "createdAt", "updatedAt")
SELECT 
  u."id",
  u."id",
  u."totalPoints",
  COALESCE(u."createdAt", NOW()),
  COALESCE(u."updatedAt", NOW())
FROM "User" u
ON CONFLICT ("userId") DO UPDATE
SET
  "totalPoints" = EXCLUDED."totalPoints",
  "updatedAt" = NOW();
