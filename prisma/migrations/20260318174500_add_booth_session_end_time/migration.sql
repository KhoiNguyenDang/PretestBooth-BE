-- Add per-booth managed session end datetime
ALTER TABLE "Booth"
ADD COLUMN "sessionEndAt" TIMESTAMP(3);
