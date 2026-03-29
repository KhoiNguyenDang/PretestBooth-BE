-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "kycRegisteredAt" TIMESTAMP(3),
ADD COLUMN "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN "kycLastAttemptAt" TIMESTAMP(3),
ADD COLUMN "kycConsentVersion" TEXT,
ADD COLUMN "kycConsentedAt" TIMESTAMP(3),
ADD COLUMN "faceEmbedding" JSONB,
ADD COLUMN "faceEmbeddingModel" TEXT,
ADD COLUMN "faceEmbeddingVersion" TEXT,
ADD COLUMN "faceEmbeddingNorm" DOUBLE PRECISION,
ADD COLUMN "faceEmbeddingUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "checkinStatus" "CheckinStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "checkinSimilarityScore" DOUBLE PRECISION,
ADD COLUMN "checkinThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
ADD COLUMN "checkinVerifiedAt" TIMESTAMP(3),
ADD COLUMN "checkinAttemptCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BookingCheckinAttempt" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "isMatch" BOOLEAN NOT NULL,
    "livenessPassed" BOOLEAN NOT NULL DEFAULT true,
    "failReason" TEXT,
    "verifierDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingCheckinAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_kycStatus_idx" ON "User"("kycStatus");

-- CreateIndex
CREATE INDEX "Booking_checkinStatus_idx" ON "Booking"("checkinStatus");

-- CreateIndex
CREATE INDEX "BookingCheckinAttempt_bookingId_createdAt_idx" ON "BookingCheckinAttempt"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingCheckinAttempt_userId_createdAt_idx" ON "BookingCheckinAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingCheckinAttempt_isMatch_idx" ON "BookingCheckinAttempt"("isMatch");

-- AddForeignKey
ALTER TABLE "BookingCheckinAttempt" ADD CONSTRAINT "BookingCheckinAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingCheckinAttempt" ADD CONSTRAINT "BookingCheckinAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
