-- CreateTable
CREATE TABLE "DeadlineChange" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "previousDueAt" TIMESTAMP(3),
    "newDueAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadlineChange_boxId_idx" ON "DeadlineChange"("boxId");

-- CreateIndex
CREATE INDEX "DeadlineChange_changedById_idx" ON "DeadlineChange"("changedById");

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "SubmissionBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
