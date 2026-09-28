-- CreateTable
CREATE TABLE "ReadCushion" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT false,
    "tone" TEXT NOT NULL DEFAULT 'soft',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadCushion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCushion" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'soft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageCushion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadCushion_memberId_threadKey_key" ON "ReadCushion"("memberId", "threadKey");

-- CreateIndex
CREATE UNIQUE INDEX "MessageCushion_messageId_memberId_key" ON "MessageCushion"("messageId", "memberId");

-- AddForeignKey
ALTER TABLE "ReadCushion" ADD CONSTRAINT "ReadCushion_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCushion" ADD CONSTRAINT "MessageCushion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCushion" ADD CONSTRAINT "MessageCushion_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
