-- CreateTable
CREATE TABLE "ScheduleAsk" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sentOn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAsk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAsk_senderId_targetId_sentOn_key" ON "ScheduleAsk"("senderId", "targetId", "sentOn");

-- AddForeignKey
ALTER TABLE "ScheduleAsk" ADD CONSTRAINT "ScheduleAsk_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAsk" ADD CONSTRAINT "ScheduleAsk_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
