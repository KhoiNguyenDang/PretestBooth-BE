-- Add exam type field to distinguish PRACTICE vs EXAM exams
-- This determines which type of booking (PRACTICE or EXAM) can access this exam

ALTER TABLE "Exam"
ADD COLUMN "type" "BookingType" NOT NULL DEFAULT 'EXAM';

-- Create index for filtering exams by type
CREATE INDEX "Exam_type_idx" ON "Exam"("type");

-- Update comment
COMMENT ON COLUMN "Exam"."type" IS 'ĐỀ LUYỆN TẬP (PRACTICE) hay ĐỀ THI (EXAM) - determines access restrictions';
