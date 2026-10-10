-- 사주 밸런스 게임의 표.
--
-- 질문은 코드의 고정 목록이라 DB 에는 답만 둔다. 한 사람이 한 질문에 한 표(`PRIMARY KEY (memberId,
-- questionId)`)이고 다시 누르면 바뀐다. 결과는 사람 수로만 보여 주므로 생년월일 같은 개인정보는 없다.
-- 팀·팀원이 지워지면 함께 지운다(CASCADE) — 표는 기록 근거가 아니라 놀이의 상태다.

-- CreateTable
CREATE TABLE "SajuBalanceVote" (
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SajuBalanceVote_pkey" PRIMARY KEY ("memberId","questionId")
);

-- CreateIndex
CREATE INDEX "SajuBalanceVote_teamId_questionId_idx" ON "SajuBalanceVote"("teamId", "questionId");

-- AddForeignKey
ALTER TABLE "SajuBalanceVote" ADD CONSTRAINT "SajuBalanceVote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SajuBalanceVote" ADD CONSTRAINT "SajuBalanceVote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
