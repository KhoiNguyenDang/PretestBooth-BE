-- CreateTable
CREATE TABLE "BoothStatusLog" (
    "id" TEXT NOT NULL,
    "boothId" TEXT NOT NULL,
    "fromStatus" "BoothStatus" NOT NULL,
    "toStatus" "BoothStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoothStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoothStatusLog_boothId_changedAt_idx" ON "BoothStatusLog"("boothId", "changedAt");

-- CreateIndex
CREATE INDEX "BoothStatusLog_changedByUserId_idx" ON "BoothStatusLog"("changedByUserId");

-- AddForeignKey
ALTER TABLE "BoothStatusLog" ADD CONSTRAINT "BoothStatusLog_boothId_fkey" FOREIGN KEY ("boothId") REFERENCES "Booth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoothStatusLog" ADD CONSTRAINT "BoothStatusLog_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
