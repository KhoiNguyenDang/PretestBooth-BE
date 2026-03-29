-- Add duration and buffer minutes tracking to Booking
ALTER TABLE "Booking"
ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "bufferMinutes" INTEGER NOT NULL DEFAULT 15;

-- Create index for efficient time-range queries
CREATE INDEX "Booking_boothId_startTime_endTime_idx" ON "Booking"("boothId", "startTime", "endTime");
