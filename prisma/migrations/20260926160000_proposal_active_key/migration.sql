-- 팀마다 "진행 중인 회의 결정"은 하나다.
--
-- 예전에는 `startProposal` 이 앞선 제안을 `deleteMany` 로 지우고 새로 만들었다. 그 결과
-- 확정된 회의도 함께 지워졌다 — 액션 하나가 낡은 화면에서 불릴 수 있으므로, 실제로는
-- 아무도 하지 않을 행동을 글러워 막는 구조였다. 여기에 유일 인덱스를 둔다.
--
-- 이월(`carried`)은 결정을 미룬 것이지 결정이 아니다. 그래서 `activeKey` 를 비워 둔다 —
-- Postgres 의 유일 인덱스는 NULL 을 서로 다른 값으로 보므로 보류 행은 몇 개나 남는다.
ALTER TABLE "MeetingProposal" ADD COLUMN "activeKey" TEXT;

CREATE UNIQUE INDEX "MeetingProposal_activeKey_key" ON "MeetingProposal"("activeKey");

UPDATE "MeetingProposal" SET "activeKey" = "teamId" WHERE "stage" <> 'carried';
