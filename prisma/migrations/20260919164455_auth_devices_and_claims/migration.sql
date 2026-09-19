-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "isLeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejoinCodeHash" TEXT;

-- AlterTable
-- 이미 있는 세션에는 만료 시각이 없다. 기본값으로 한 번 채우고 기본값을 뗀다 —
-- 새 세션은 코드가 계산한 값을 넣어야 하므로 기본값을 남겨 두면 안 된다.
ALTER TABLE "Session" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days'),
ADD COLUMN     "label" TEXT,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Session" ALTER COLUMN "expiresAt" DROP DEFAULT;

-- 팀을 만든 사람 = 그 팀에 가장 먼저 들어온 사람. 기존 데이터에도 팀장이 하나씩 있어야 한다.
UPDATE "Member" m SET "isLeader" = true
WHERE m.id = (
  SELECT id FROM "Member" WHERE "teamId" = m."teamId" ORDER BY "joinedAt" ASC, id ASC LIMIT 1
);

-- CreateTable
CREATE TABLE "MemberClaim" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "approvedById" TEXT,

    CONSTRAINT "MemberClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberClaim_token_key" ON "MemberClaim"("token");

-- CreateIndex
CREATE INDEX "MemberClaim_memberId_idx" ON "MemberClaim"("memberId");

-- AddForeignKey
ALTER TABLE "MemberClaim" ADD CONSTRAINT "MemberClaim_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberClaim" ADD CONSTRAINT "MemberClaim_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
