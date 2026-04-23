-- Add new lecturer permission for KYC manual approval
ALTER TYPE "LecturerPermission" ADD VALUE IF NOT EXISTS 'APPROVE_KYC';

-- Add manual review status enum for KYC review workflow
CREATE TYPE "KycManualReviewStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'REJECTED');

-- Add KYC manual review metadata fields on user
ALTER TABLE "User"
ADD COLUMN "kycFaceImageUrl" TEXT,
ADD COLUMN "kycManualReviewStatus" "KycManualReviewStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN "kycManualReviewRequestedAt" TIMESTAMP(3),
ADD COLUMN "kycManualReviewRequestedReason" TEXT,
ADD COLUMN "kycManualReviewReviewedAt" TIMESTAMP(3),
ADD COLUMN "kycManualReviewedByUserId" TEXT,
ADD COLUMN "kycManualReviewRejectionReason" TEXT,
ADD COLUMN "kycManualReviewNotes" TEXT;

CREATE INDEX "User_kycManualReviewStatus_idx" ON "User"("kycManualReviewStatus");
CREATE INDEX "User_kycManualReviewRequestedAt_idx" ON "User"("kycManualReviewRequestedAt");
CREATE INDEX "User_kycManualReviewReviewedAt_idx" ON "User"("kycManualReviewReviewedAt");
