-- Configurable booking duration options managed by admin
CREATE TABLE "BookingDurationOption" (
  "id" TEXT NOT NULL,
  "type" "BookingType" NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingDurationOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingDurationOption_type_durationMinutes_key"
ON "BookingDurationOption"("type", "durationMinutes");

CREATE INDEX "BookingDurationOption_type_isActive_idx"
ON "BookingDurationOption"("type", "isActive");

-- Seed baseline options so existing flows still work after migration
INSERT INTO "BookingDurationOption" ("id", "type", "durationMinutes", "isActive", "displayOrder", "createdAt", "updatedAt")
VALUES
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99801', 'PRACTICE', 30, true, 1, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99802', 'PRACTICE', 45, true, 2, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99803', 'PRACTICE', 60, true, 3, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99811', 'EXAM', 30, true, 1, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99812', 'EXAM', 45, true, 2, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99813', 'EXAM', 60, true, 3, NOW(), NOW()),
  ('ad8ca95f-605f-4e16-a7ca-9bead3c99814', 'EXAM', 75, true, 4, NOW(), NOW());
