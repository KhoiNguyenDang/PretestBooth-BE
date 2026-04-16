-- Normalize booking/check-in timeline columns to timezone-aware type.
-- Existing TIMESTAMP(3) values are interpreted as Asia/Ho_Chi_Minh local wall-clock
-- and converted to absolute instants in TIMESTAMPTZ(3).

ALTER TABLE "ExamSession"
  ALTER COLUMN "startedAt" TYPE TIMESTAMPTZ(3) USING "startedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "finishedAt" TYPE TIMESTAMPTZ(3) USING "finishedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "Booth"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "activationOtpExpiresAt" TYPE TIMESTAMPTZ(3) USING "activationOtpExpiresAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "activationOtpUsedAt" TYPE TIMESTAMPTZ(3) USING "activationOtpUsedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "sessionActivatedAt" TYPE TIMESTAMPTZ(3) USING "sessionActivatedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "BoothStatusLog"
  ALTER COLUMN "changedAt" TYPE TIMESTAMPTZ(3) USING "changedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "Booking"
  ALTER COLUMN "startTime" TYPE TIMESTAMPTZ(3) USING "startTime" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "endTime" TYPE TIMESTAMPTZ(3) USING "endTime" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "checkedInAt" TYPE TIMESTAMPTZ(3) USING "checkedInAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "checkedOutAt" TYPE TIMESTAMPTZ(3) USING "checkedOutAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "checkinVerifiedAt" TYPE TIMESTAMPTZ(3) USING "checkinVerifiedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "BookingCheckinAttempt"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "PointTransaction"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "ProctoringEvent"
  ALTER COLUMN "timestamp" TYPE TIMESTAMPTZ(3) USING "timestamp" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "PracticeSession"
  ALTER COLUMN "startedAt" TYPE TIMESTAMPTZ(3) USING "startedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "finishedAt" TYPE TIMESTAMPTZ(3) USING "finishedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';
