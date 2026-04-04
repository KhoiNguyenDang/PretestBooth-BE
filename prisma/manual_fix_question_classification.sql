DO $$
BEGIN
  CREATE TYPE "QuestionClassification" AS ENUM ('PRACTICE', 'EXAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Question"
ADD COLUMN IF NOT EXISTS "classification" "QuestionClassification" NOT NULL DEFAULT 'EXAM';

CREATE INDEX IF NOT EXISTS "Question_classification_idx" ON "Question"("classification");
