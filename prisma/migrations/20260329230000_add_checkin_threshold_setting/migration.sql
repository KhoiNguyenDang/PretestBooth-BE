-- Persist system-level facial check-in threshold and lower default to 0.6.
CREATE TABLE "SystemSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "description" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "SystemSetting_updatedByUserId_idx" ON "SystemSetting"("updatedByUserId");

ALTER TABLE "Booking"
  ALTER COLUMN "checkinThreshold" SET DEFAULT 0.6;

ALTER TABLE "BookingCheckinAttempt"
  ALTER COLUMN "threshold" SET DEFAULT 0.6;

UPDATE "Booking"
SET "checkinThreshold" = 0.6
WHERE "checkinThreshold" = 0.85;

INSERT INTO "SystemSetting" ("key", "value", "description")
VALUES (
  'CHECKIN_SIMILARITY_THRESHOLD',
  '0.6',
  'Cosine similarity threshold for booth face check-in verification'
)
ON CONFLICT ("key") DO NOTHING;
