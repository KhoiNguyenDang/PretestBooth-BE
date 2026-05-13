-- Finalize pure Student/Lecturer operational ownership

-- Submission: remove legacy user ownership
ALTER TABLE "Submission" DROP CONSTRAINT IF EXISTS "Submission_userId_fkey";
DROP INDEX IF EXISTS "Submission_userId_idx";
DROP INDEX IF EXISTS "Submission_userId_problemId_idx";
ALTER TABLE "Submission" DROP COLUMN IF EXISTS "userId";

-- Problem/Question/Exam: remove legacy creator ownership on User
ALTER TABLE "Problem" DROP CONSTRAINT IF EXISTS "Problem_creatorId_fkey";
DROP INDEX IF EXISTS "Problem_creatorId_idx";
ALTER TABLE "Problem" DROP COLUMN IF EXISTS "creatorId";

ALTER TABLE "Question" DROP CONSTRAINT IF EXISTS "Question_creatorId_fkey";
DROP INDEX IF EXISTS "Question_creatorId_idx";
ALTER TABLE "Question" DROP COLUMN IF EXISTS "creatorId";

ALTER TABLE "Exam" DROP CONSTRAINT IF EXISTS "Exam_creatorId_fkey";
DROP INDEX IF EXISTS "Exam_creatorId_idx";
ALTER TABLE "Exam" DROP COLUMN IF EXISTS "creatorId";

-- Question review: move reviewer ownership to Lecturer
ALTER TABLE "QuestionReviewSession" DROP CONSTRAINT IF EXISTS "QuestionReviewSession_reviewedBy_fkey";
DROP INDEX IF EXISTS "QuestionReviewSession_reviewedBy_idx";
ALTER TABLE "QuestionReviewSession" DROP COLUMN IF EXISTS "reviewedBy";

ALTER TABLE "QuestionReviewAction" DROP CONSTRAINT IF EXISTS "QuestionReviewAction_reviewedBy_fkey";
DROP INDEX IF EXISTS "QuestionReviewAction_reviewedBy_idx";
ALTER TABLE "QuestionReviewAction" DROP COLUMN IF EXISTS "reviewedBy";
