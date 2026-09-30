-- 결과 화면에서 **이 판이 지나온 길**을 보여 준다.
--
-- ## 무엇이 없었는가
--
-- 1) **몇 번째 밤에 빠졌는지가 없었다.** `IceSeat.outAt` 은 시각만 담았다. 밤 하나가 자정을 넘겨
--    진행되면 **날짜로는 구분할 수 없다**(2일차 밤이 다음 날 00:30일 수 있다). 그래서
--    `outDay` 를 자리를 **빠지는 순간**에 함께 적는다.
--
-- 2) **결선이 지나간 표가 없었다.** 결선은 같은 표를 다시 고르는 것이 아니라 **새 투표 회차**다
--    (`20260930190000` 의 키가 `seq` 이니 늘려야 지난 표가 남는다). 그러면 "이 투표가 결선이었다"
--    는 사실이 표에 없으면 타임라인에 두 개의 같은 투표가 나란히 찍힌다 — 결선 뒤 무엇이 있었는지
--    알 수 없다. 그래서 표에 `runoff` 를 적는다.
--
-- 3) **결선 한도도 세야 했다.** `20260930190000` 은 "몇 번째 회차" 로 한도를 재던데, 회차는
--    밤이 지날 때마다도 올라가 **하루에 결선 세 번**하면 다음 날 아침에 한도가 차 버렸다.
--    밤과 무관하게 **이번 투표에서 결선을 몇 번 했는지** 세는 값으로 바꾼다.
--
-- ## 예전에 진행 중이던 판
--
-- ⚠️ **진행 중인 판의 표는 `outDay` 로 되돌려 넣지 않는다.** 죽은 사람이 언제 죽었는지 알 수 있는
--    값이 없다 — 기록을 지어내는 마이그레이션은 하지 않는다. 이미 죽은 자리는 `outDay` 가 null 로
--    남아 타임라인에서 "몇 일차" 없이 "밤" 으로만 보인다.
-- 밤에 지목된 사람은 되살린다 — 마피아가 지목한 대상은 **밤 행동 기록**에 정확히 남아 있다.
--
-- ## `IceSeat.voteForId` 는 이미 없다
--
-- 표는 `IceBallot` 에 있다(20260930190000). 여기서는 자리에 "몇 번째 밤인지" 만 더 적는다.
ALTER TABLE "IceSeat" ADD COLUMN "outDay" INTEGER;

-- 이 판에서 지금 투표가 몇 번째 회차이고, 이번 투표에서 결선을 몇 번 했는가.
ALTER TABLE "IceRound" ADD COLUMN "runoffCount" INTEGER NOT NULL DEFAULT 0;

-- 이 표가 결선에서 나온 것인가. 결선 투표가 두 번 나란히 찍힐 때 구분하는 값이다.
ALTER TABLE "IceBallot" ADD COLUMN "runoff" BOOLEAN NOT NULL DEFAULT false;

-- 밤에 지목되어 죽은 자리는 그 밤 번호를 **기록에서 되살린다** — 마피아가 지목한 대상은 남는다.
UPDATE "IceSeat" s
SET "outDay" = a."day"
FROM (
  SELECT DISTINCT ON ("targetId") "targetId", "day"
  FROM "IceNightAction"
  WHERE "kind" = 'mafia_kill'
  ORDER BY "targetId", "day" DESC
) a
WHERE s."outAt" IS NOT NULL
  AND s."outHow" = 'night'
  AND a."targetId" = s."memberId"
  AND EXISTS (SELECT 1 FROM "IceRound" r WHERE r."id" = s."roundId");
