-- AlterTable
ALTER TABLE "ContribRecord" ADD COLUMN "originType" TEXT,
ADD COLUMN "originId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContribRecord_originType_originId_memberId_key" ON "ContribRecord"("originType", "originId", "memberId");

-- CreateIndex
CREATE INDEX "ContribRecord_originType_originId_idx" ON "ContribRecord"("originType", "originId");
