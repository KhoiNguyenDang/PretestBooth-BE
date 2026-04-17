-- Rename BookingStatus enum values to new canonical set and migrate existing data.
CREATE TYPE "BookingStatus_new" AS ENUM ('CONFIRM', 'CHECKED_IN', 'COMPLETED', 'CANCEL', 'ABSENT');

ALTER TABLE "Booking"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Booking"
ALTER COLUMN "status" TYPE "BookingStatus_new"
USING (
  CASE
    WHEN "status"::text IN ('PENDING', 'CONFIRMED') THEN 'CONFIRM'
    WHEN "status"::text = 'CHECKED_IN' THEN 'CHECKED_IN'
    WHEN "status"::text = 'COMPLETED' THEN 'COMPLETED'
    WHEN "status"::text = 'CANCELLED' THEN 'CANCEL'
    WHEN "status"::text = 'NO_SHOW' THEN 'ABSENT'
    ELSE 'CONFIRM'
  END
)::"BookingStatus_new";

DROP TYPE "BookingStatus";
ALTER TYPE "BookingStatus_new" RENAME TO "BookingStatus";

ALTER TABLE "Booking"
ALTER COLUMN "status" SET DEFAULT 'CONFIRM';
