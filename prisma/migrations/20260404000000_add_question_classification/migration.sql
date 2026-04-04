-- CreateEnum
CREATE TYPE "QuestionClassification" AS ENUM ('PRACTICE', 'EXAM');

-- AlterTable
ALTER TABLE "Question"
ADD COLUMN "classification" "QuestionClassification" NOT NULL DEFAULT 'EXAM';

-- CreateIndex
CREATE INDEX "Question_classification_idx" ON "Question"("classification");
