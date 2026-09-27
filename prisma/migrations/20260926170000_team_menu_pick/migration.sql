-- 메뉴 룰렛 결과를 팀에 하나 둔다.
--
-- 예전에는 폰마다 `Math.random()` 으로 따로 돌렸고 서버를 부르지도 않았다. 팀원 네 명이
-- 각자 다른 메뉴를 보고 "뭐 먹지?"가 그대로였고, 새로고침하면 또 다른 값이 나왔다.
-- 결과 하나만 공유하면 되는 일이라 이력은 두지 않는다 — 누가 언제 정했는지는 남기지 않는다.
ALTER TABLE "Team"
  ADD COLUMN "menuPick" TEXT,
  ADD COLUMN "menuDrawnBy" TEXT,
  ADD COLUMN "menuPickedAt" TIMESTAMP(3);
