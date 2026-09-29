-- 할 일에 "누가 넣었나"를 남긴다 — 담당자 지정 권한의 근거로.
--
-- 왜: `Task` 에는 담당자(`assigneeId`)만 있었고 **만든 사람**이 없었다. 그래서 "이 할 일을
-- 내가 만들었는가" 를 서버가 알 수 없어서, 남에게 일을 떠맡기는 것을 막을 수 없었다.
-- 화면 주석에만 "누구나 배정할 수 있다" 고 적혀 있을 뿐이었다(2026-09-28).
--
-- 되돌릴 수 없는 판단을 만들지 않으려면 **주인을 먼저** 기록해야 한다. 아래 규칙은 그 값
-- 위에서만 판단한다 — `server/actions/tasks.ts` 의 `canEditTask`.
--
-- ⚠️ **기존 행은 `null` 로 남는다.** 주인이 누구인지 되돌릴 수 없기 때문이다. 그래서
-- `null` 인 할 일은 **팀장만** 고칠 수 있게 했다(규칙이 예외를 새면 이 값이 의미를 잃는다).
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;

CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
