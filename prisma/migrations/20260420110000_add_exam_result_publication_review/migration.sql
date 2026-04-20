-- Create enums for publication state and grading audit actions
CREATE TYPE "ResultPublicationStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED');

CREATE TYPE "GradeAuditAction" AS ENUM (
  'AUTO_GRADED',
  'REVIEWED_SHORT_ANSWER',
  'RESULT_PUBLISHED',
  'RESULT_UPDATED_AFTER_PUBLISH'
);

-- Extend ExamSession with result publication metadata
ALTER TABLE "ExamSession"
ADD COLUMN "resultPublicationStatus" "ResultPublicationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN "resultPublishedAt" TIMESTAMPTZ(3),
ADD COLUMN "resultLastUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN "resultRevisionCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing submitted/graded sessions as already published for compatibility
UPDATE "ExamSession"
SET
  "resultPublicationStatus" = 'PUBLISHED',
  "resultPublishedAt" = COALESCE("finishedAt", "createdAt"),
  "resultLastUpdatedAt" = COALESCE("finishedAt", "createdAt")
WHERE "status" IN ('SUBMITTED', 'GRADED');

-- Extend ExamSessionAnswer with AI/manual review metadata
ALTER TABLE "ExamSessionAnswer"
ADD COLUMN "aiSuggestedIsCorrect" BOOLEAN,
ADD COLUMN "aiSuggestedScore" DOUBLE PRECISION,
ADD COLUMN "aiGradingRationale" TEXT,
ADD COLUMN "aiGradedAt" TIMESTAMP(3),
ADD COLUMN "manualIsCorrect" BOOLEAN,
ADD COLUMN "manualScore" DOUBLE PRECISION,
ADD COLUMN "reviewerFeedback" TEXT,
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- Create grade audit table
CREATE TABLE "ExamSessionGradeAudit" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "examItemId" TEXT,
  "action" "GradeAuditAction" NOT NULL,
  "previousScore" DOUBLE PRECISION,
  "newScore" DOUBLE PRECISION,
  "previousIsCorrect" BOOLEAN,
  "newIsCorrect" BOOLEAN,
  "feedback" TEXT,
  "actorUserId" TEXT,
  "actorRole" "Role",
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ExamSessionGradeAudit_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "ExamSession_resultPublicationStatus_idx" ON "ExamSession"("resultPublicationStatus");
CREATE INDEX "ExamSessionAnswer_reviewedByUserId_idx" ON "ExamSessionAnswer"("reviewedByUserId");
CREATE INDEX "ExamSessionAnswer_reviewedAt_idx" ON "ExamSessionAnswer"("reviewedAt");
CREATE INDEX "ExamSessionGradeAudit_sessionId_createdAt_idx" ON "ExamSessionGradeAudit"("sessionId", "createdAt");
CREATE INDEX "ExamSessionGradeAudit_action_idx" ON "ExamSessionGradeAudit"("action");
CREATE INDEX "ExamSessionGradeAudit_actorUserId_idx" ON "ExamSessionGradeAudit"("actorUserId");

-- Foreign key
ALTER TABLE "ExamSessionGradeAudit"
ADD CONSTRAINT "ExamSessionGradeAudit_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
