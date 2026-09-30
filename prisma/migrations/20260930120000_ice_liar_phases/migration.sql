-- 라이어 게임을 **한 판이 끝나는 게임**으로 만든다.
--
-- ## 무엇이 틀렸는가
--
-- 1) **라이어의 마지막 제시어 맞히기가 불가능했다.** `liarOutcome()` 은 "라이어가 제시어를
--    맞혀 보세요"라고 문구를 내보냈지만, 같은 순간 `phase` 가 `revealed` 가 되어
--    `result.word` 로 제시어가 이미 떠 있었다. 규칙 설명에만 존재하던 기회가 상태 모델에
--    없었던 것이다. 그래서 `liar_guess` 단계를 새로 만든다.
--
-- 2) **동점이거나 0표면 라이어 승리가 됐다.** `countVotes()` 는 동점에서 `top = null` 을
--    주고, 액션은 `caught = false` 를 라이어 승리로 읽었다. 표를 하나도 못 받은 상태에서
--    사회자가 실수로 "결과 공개"를 눌러도 판이 끝났다. `resultCode` 로 승패를 구분해
--    동점은 승부가 나지 않은 것으로 남긴다.
--
-- ## phase 값이 늘어난 이유
--
-- 예전엔 `play` / `revealed` 두 개였다 — 카드 확인과 투표가 한 단계, 공개가 그다음.
-- 라이어 판은 `clue`(카드) → `vote`(투표) → `liar_guess`(최종 추측) → `revealed`.
-- 마피아 판은 밤과 낮이 엇갈리므로 예전대로 `play` → `revealed` 다.
--
-- ⚠️ **이미 진행 중이던 판은 예전 값(`play`)을 그대로 둔다.** 마이그레이션이 값을 고치면
-- 진행 중인 판의 단계가 앞당겨진다. 예전 값으로 남긴 판은 읽을 때 `vote` 로 해석한다
-- (`view.ts` 의 `icePhase`) — 한 판은 몇 분 안에 끝나므로 판을 새로 여는 편이 낫다.
--
-- ## outcome 은 남겨 둔다
--
-- 예전 판의 결과 문장이 들어 있다. 지우면 그 판의 결과 화면이 빈칸이 된다 — 기록을 지우는
-- 마이그레이션은 하지 않는다. **이제부터는 쓰지 않는다.** 새 판은 `resultCode` 만 쓰고
-- 문장은 화면이 만든다.
ALTER TABLE "IceRound" ADD COLUMN "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "IceRound" ADD COLUMN "accusedId" TEXT;

ALTER TABLE "IceRound" ADD COLUMN "liarGuess" TEXT;

ALTER TABLE "IceRound" ADD COLUMN "guessCorrect" BOOLEAN;

ALTER TABLE "IceRound" ADD COLUMN "winner" TEXT;

ALTER TABLE "IceRound" ADD COLUMN "resultCode" TEXT;

ALTER TABLE "IceRound" ADD COLUMN "phaseStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 누가 말할지(1부터). 시작할 때 무작위로 한 번 정하고 화면은 그것만 보여 준다 —
-- 대화는 오프라인에서 하고, 앱은 순서만 안내한다.
ALTER TABLE "IceSeat" ADD COLUMN "turnOrder" INTEGER;