-- Add exam-level passing score threshold for official pretest exam-source mode
ALTER TABLE "Exam"
ADD COLUMN IF NOT EXISTS "passingScoreAbsolute" DOUBLE PRECISION;
