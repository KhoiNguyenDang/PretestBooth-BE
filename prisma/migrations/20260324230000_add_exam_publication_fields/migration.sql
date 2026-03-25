-- Add publication visibility + scheduling metadata for exams
CREATE TYPE "ExamVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

ALTER TABLE "Exam"
ADD COLUMN "visibility" "ExamVisibility" NOT NULL DEFAULT 'PRIVATE',
ADD COLUMN "publishAt" TIMESTAMP(3),
ADD COLUMN "publishedAt" TIMESTAMP(3);

-- Preserve legacy publication semantics
UPDATE "Exam"
SET "visibility" = CASE WHEN "isPublished" = true THEN 'PUBLIC'::"ExamVisibility" ELSE 'PRIVATE'::"ExamVisibility" END;

UPDATE "Exam"
SET "publishedAt" = COALESCE("publishedAt", "updatedAt", "createdAt")
WHERE "isPublished" = true AND "publishedAt" IS NULL;

CREATE INDEX "Exam_visibility_idx" ON "Exam"("visibility");
CREATE INDEX "Exam_publishAt_idx" ON "Exam"("publishAt");
