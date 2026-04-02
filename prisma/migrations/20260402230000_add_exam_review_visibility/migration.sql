-- Add per-exam policy flag to control whether students can review results later.
ALTER TABLE "Exam"
ADD COLUMN "allowStudentReviewResults" BOOLEAN NOT NULL DEFAULT false;
