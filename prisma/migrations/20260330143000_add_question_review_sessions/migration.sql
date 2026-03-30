-- Quarterly question review sessions with immutable audit trail actions.
CREATE TYPE "QuestionReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_REVISION', 'SKIPPED');

CREATE TABLE "QuestionReviewSession" (
  "id" TEXT NOT NULL,
  "quarter" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "academicYear" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "QuestionReviewStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "questionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuestionReviewSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionReviewAction" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "status" "QuestionReviewStatus" NOT NULL,
  "notes" TEXT,
  "reviewedBy" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuestionReviewAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionReviewSession_quarter_year_questionId_key" ON "QuestionReviewSession"("quarter", "year", "questionId");
CREATE INDEX "QuestionReviewSession_quarter_year_status_idx" ON "QuestionReviewSession"("quarter", "year", "status");
CREATE INDEX "QuestionReviewSession_reviewedBy_idx" ON "QuestionReviewSession"("reviewedBy");
CREATE INDEX "QuestionReviewSession_questionId_idx" ON "QuestionReviewSession"("questionId");

CREATE INDEX "QuestionReviewAction_sessionId_idx" ON "QuestionReviewAction"("sessionId");
CREATE INDEX "QuestionReviewAction_reviewedBy_idx" ON "QuestionReviewAction"("reviewedBy");
CREATE INDEX "QuestionReviewAction_reviewedAt_idx" ON "QuestionReviewAction"("reviewedAt");

ALTER TABLE "QuestionReviewSession"
  ADD CONSTRAINT "QuestionReviewSession_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionReviewSession"
  ADD CONSTRAINT "QuestionReviewSession_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuestionReviewAction"
  ADD CONSTRAINT "QuestionReviewAction_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "QuestionReviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionReviewAction"
  ADD CONSTRAINT "QuestionReviewAction_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
