-- AlterTable
ALTER TABLE "User" ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emailVerificationToken" TEXT,
ADD COLUMN "emailVerificationExpiry" TIMESTAMP(3);
