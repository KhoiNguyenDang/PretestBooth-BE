-- Add check-in status for fallback allowance
ALTER TYPE "CheckinStatus" ADD VALUE IF NOT EXISTS 'FAILED_BUT_ALLOWED';

-- Add KYC student-card verification metadata on user
ALTER TABLE "User"
ADD COLUMN "studentCardImageUrl" TEXT,
ADD COLUMN "studentCardVerifiedAt" TIMESTAMP(3),
ADD COLUMN "studentCardFaceMatchScore" DOUBLE PRECISION;

-- Add fallback metadata on booking
ALTER TABLE "Booking"
ADD COLUMN "fallbackAppliedAt" TIMESTAMPTZ(3),
ADD COLUMN "fallbackEvidenceImageUrl" TEXT;

-- Add optional evidence image URL for each check-in attempt
ALTER TABLE "BookingCheckinAttempt"
ADD COLUMN "evidenceImageUrl" TEXT;
