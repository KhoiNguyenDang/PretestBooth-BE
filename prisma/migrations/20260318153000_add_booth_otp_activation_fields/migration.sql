-- Add booth code and activation/session fields for booth OTP flow
ALTER TABLE "Booth"
ADD COLUMN "code" TEXT,
ADD COLUMN "activationOtpHash" TEXT,
ADD COLUMN "activationOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN "activationOtpUsedAt" TIMESTAMP(3),
ADD COLUMN "activationOtpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sessionTokenHash" TEXT,
ADD COLUMN "sessionActivatedAt" TIMESTAMP(3),
ADD COLUMN "sessionExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Booth_code_key" ON "Booth"("code");
CREATE INDEX "Booth_sessionExpiresAt_idx" ON "Booth"("sessionExpiresAt");
