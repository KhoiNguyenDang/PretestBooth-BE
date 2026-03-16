-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "shuffleChoices" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "shuffleQuestions" BOOLEAN NOT NULL DEFAULT true;
