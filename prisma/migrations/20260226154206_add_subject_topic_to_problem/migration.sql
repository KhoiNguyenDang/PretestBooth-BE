-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "topicId" TEXT;

-- CreateIndex
CREATE INDEX "Problem_subjectId_idx" ON "Problem"("subjectId");

-- CreateIndex
CREATE INDEX "Problem_topicId_idx" ON "Problem"("topicId");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
