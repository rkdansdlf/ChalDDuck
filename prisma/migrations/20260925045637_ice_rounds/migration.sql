-- 28 아이스브레이킹(라이어·마피아)의 판과 자리. 비밀(제시어·역할)은 서버에만 있다.
-- CreateTable
CREATE TABLE "IceRound" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "activeKey" TEXT,
    "game" TEXT NOT NULL,
    "phase" TEXT NOT NULL DEFAULT 'play',
    "topic" TEXT,
    "word" TEXT,
    "outcome" TEXT,
    "hostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "IceRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IceSeat" (
    "roundId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "outAt" TIMESTAMP(3),
    "outHow" TEXT,
    "voteForId" TEXT,

    CONSTRAINT "IceSeat_pkey" PRIMARY KEY ("roundId","memberId")
);

-- CreateIndex
CREATE UNIQUE INDEX "IceRound_activeKey_key" ON "IceRound"("activeKey");

-- CreateIndex
CREATE INDEX "IceRound_teamId_createdAt_idx" ON "IceRound"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "IceRound" ADD CONSTRAINT "IceRound_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceRound" ADD CONSTRAINT "IceRound_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceSeat" ADD CONSTRAINT "IceSeat_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "IceRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IceSeat" ADD CONSTRAINT "IceSeat_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
