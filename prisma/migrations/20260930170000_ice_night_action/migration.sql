-- 마피아의 밤 행동을 앱이 받는다.
--
-- ## 무엇이 틀렸는가
--
-- 1) **밤 행동이 어디에도 남지 않았다.** 지목·치료·조사는 손짓으로 오가고 앱은 "누가 빠졌나"만
--    알았다. 그래서 밤이 몇 번인지 알 수 없고, 의사가 어젯밤 누구를 살렸는지도 남지 않았다.
--
-- 2) **밤에 빠지는 사람 수를 아무도 막지 못했다.** `markIceNightOut()` 이 두 번 실행되면 한 밤에
--    두 사람이 죽었다. (20260930150000 에서 밤 단계와 밤당 한 명을 넣었지만, **누가 그 한 명인지
--    말로 정하는 동안** 그 구멍은 남는다.)
--
-- ## 왜 한 줄짜리 키인가
--
-- 키가 `(roundId, day, actorId, kind)` 다. 같은 사람이 같은 밤에 다시 고르면 **두 줄이 아니라
-- 한 줄이 바뀐다** — 밤에 결정을 바꿀 수 있어야 하고, 두 줄이 쌓이면 "이미 몇 명이 골랐나" 를
-- 셀 수 없다(그리고 밤이 풀렸는지 알 방법이 사라진다).
--
-- ## 왜 `targetId` 에 관계가 없다
--
-- `IceRound.accusedId` 와 같이 **외래 키를 두지 않는다.** 밤 행동의 대상은 "그 밤에 살아 있던
-- 사람" 이고, 사람이 팀을 나가도 그 밤의 기록이 지워져야 하는 이유가 없다 — 지워지면 경찰이
-- 지난 밤의 조사 결과를 잃는다. 관계를 두면 강제 삭제 규칙을 정해야 하고, 그 정답은 없다.
--
-- ## 사라지지 않는 것
--
-- **경찰의 조사 대상은 밤이 끝나도 남는다.** 경찰은 다음 밤까지 그 사실을 기억해야 하고, 그
-- 결과는 그 경찰에게만 보여 준다(`view.ts`).
CREATE TABLE "IceNightAction" (
    "roundId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IceNightAction_pkey" PRIMARY KEY ("roundId","day","actorId","kind")
);

-- 밤을 판정할 때 "이 판의 이 밤" 행동을 한 번에 읽는다.
CREATE INDEX "IceNightAction_roundId_day_idx" ON "IceNightAction"("roundId", "day");

-- 경찰이 지난 밤의 조회를 찾는다 — 밤 번호를 몰라도 자기 것이어야 한다.
CREATE INDEX "IceNightAction_roundId_actorId_idx" ON "IceNightAction"("roundId", "actorId");

ALTER TABLE "IceNightAction" ADD CONSTRAINT "IceNightAction_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "IceRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;
