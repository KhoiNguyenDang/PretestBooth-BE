-- Backfill data from userId to new student/lecturer relations

-- 1. PointAccount: migrate userId → studentId
UPDATE "PointAccount" pa
SET "studentId" = s."id"
FROM "Student" s
WHERE s."userId" = pa."userId"
AND pa."studentId" IS NULL;

-- 1b. PointAccount: delete orphaned records without a matching Student
DELETE FROM "PointAccount"
WHERE "studentId" IS NULL;

-- 2. ProctoringEvent: migrate userId → studentId (via exam/practice session)
UPDATE "ProctoringEvent" pe
SET "studentId" = s."id"
FROM "Student" s
WHERE pe."studentId" IS NULL
AND (
  (pe."examSessionId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "ExamSession" es WHERE es."id" = pe."examSessionId" AND es."userId" = s."userId"
  ))
  OR
  (pe."practiceSessionId" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "PracticeSession" ps WHERE ps."id" = pe."practiceSessionId" AND ps."userId" = s."userId"
  ))
);

-- 3. QuestionReviewSession: migrate reviewer userId → lecturerId (optional, for those with lecturer profile)
UPDATE "QuestionReviewSession" qrs
SET "lecturerId" = l."id"
FROM "Lecturer" l
WHERE l."userId" = qrs."reviewedBy"
AND qrs."lecturerId" IS NULL;
