-- 이 사람이 **내 1:1 목록에서 빼 놓은** 대화 — 2026-10-03 결정.
--
-- 왜: DM 에 개설 단계는 없고(첫 메시지가 방을 만든다) 목록은 모든 팀원을 이미 보여 준다.
-- 그래서 남던 것은 **빼는 길**이었다. 대화는 두 사람의 것이므로 나 혼자 나간다고 상대의 말을
-- 지울 수는 없다 — 이 표는 **"내 목록에서 뺀다"** 만 적고 `Message` 는 건드리지 않는다.
--
-- 다시 여는 길이 있어야 한다 — 숨긴 대화는 목록에서 사라지므로, 열면 자동으로 숨김이 풀린다.
-- 도달은 팀원 목록(한 명을 눌러 DM 열기)에서 한다.
--
-- CreateTable
CREATE TABLE "DmThreadHide" (
    "memberId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DmThreadHide_pkey" PRIMARY KEY ("memberId","threadKey")
);

-- AddForeignKey
ALTER TABLE "DmThreadHide" ADD CONSTRAINT "DmThreadHide_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
