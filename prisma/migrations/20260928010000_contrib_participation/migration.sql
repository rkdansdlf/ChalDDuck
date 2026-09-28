-- 회의 참여 표시 — 팀장이 직접 찍는다.
--
-- 앱이 입장·발언을 판정하지 않는다는 결정(README 3절)에 따라, 표시의 **주체**는 팀장이다.
-- 붙는 곳은 기록 하나이고 참여자는 `ContribRecord.memberId` 다 — 따로 적지 않는다. 두 곳에
-- 적으면 서로 어긋나고, 어느 쪽이 맞는지 알 방법이 없다.
--
-- `activeKey` 는 현재 표시 중일 때 그 기록의 id를 담는다. 취소하면 null 이 되고, 지운 자리에
-- 다시 찍을 수 있다. 유일 인덱스가 "한 기록에 표시가 두 개"를 DB 에서 막는다
-- (`MeetingProposal.activeKey` · `IceRound.activeKey` 와 같은 방식).
--
-- 취소해도 행을 지우지 않는다 — 공로 평가가 아니라 사실 기록이라 누가 찍고 누가 지웠는지
-- 남아야 나중에 따져 볼 수 있다.
CREATE TABLE "ContribParticipation" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "activeKey" TEXT,
    "shownById" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedById" TEXT,
    "clearedAt" TIMESTAMP(3),

    CONSTRAINT "ContribParticipation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContribParticipation_activeKey_key" ON "ContribParticipation"("activeKey");
CREATE INDEX "ContribParticipation_recordId_shownAt_idx" ON "ContribParticipation"("recordId", "shownAt");

ALTER TABLE "ContribParticipation"
    ADD CONSTRAINT "ContribParticipation_recordId_fkey"
    FOREIGN KEY ("recordId") REFERENCES "ContribRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContribParticipation"
    ADD CONSTRAINT "ContribParticipation_shownById_fkey"
    FOREIGN KEY ("shownById") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContribParticipation"
    ADD CONSTRAINT "ContribParticipation_clearedById_fkey"
    FOREIGN KEY ("clearedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
