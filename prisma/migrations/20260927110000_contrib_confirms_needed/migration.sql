-- 기록이 확정되려면 몇 명이 확인해야 하는지를 **팀이 정한다.**
--
-- 예전에는 `server/contrib/state.ts` 의 코드 상수였다. 상수로 두면 기준을 정하는 사람이
-- 코드를 고쳐 배포해야 했고, 기준이 미정인 상태가 화면 문구로만 남았다.
--
-- 기본값 1 은 지금 동작과 같다 — 전원으로 두면 한 사람이 답하지 않을 때 영영 확정되지 않으므로
-- 그쪽이 기본이다. NOT NULL 이라 예전 팀 행도 곧바로 이 값이 된다(데이터를 다시 쓸 필요가 없다).
ALTER TABLE "Team" ADD COLUMN "confirmsNeeded" INTEGER NOT NULL DEFAULT 1;
