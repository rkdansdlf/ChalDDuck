-- AI 호출이 **어떻게 됐는지** 를 남긴다.
--
-- 왜 새 표인가: `AiUsage` 는 "몇 번 썼나"(하루 한도)를 세는 장부다. 그런데 0단계 1번에서
-- **실패한 호출은 한도를 쓰지 않는다** 고 정해서, 실패하면 그 행이 **삭제된다.** 그러면
-- 실패의 흔적이 어디에도 남지 않아 "이 도구가 왜 안 되나" 를 나중에 알 수 없다.
--
-- 그래서 **삭제되지 않는 자리**를 따로 만든다. 한 장부의 행이 두 목적을 다 하면 한쪽이
-- 지워질 때 다른 쪽도 함께 사라진다 — 한도 표에 실패를 남기려면 환불을 포기해야 하고,
-- 그건 1번이 고친 바로 그 손해다.
--
-- 남기는 것: 도구 · **실제로 응답한 모델** · 지연 · 결과(ok/refused/failed) · 한국 날짜.
-- **남기지 않는 것: 입력한 글도 결과도 아니다.** `AiUsage` 와 같은 약속을 여기서도 지킨다.
--
-- `refused` 를 `failed` 와 따로 두는 이유: 거절은 **답이 온 것**이다(모델이 "못 하겠다"고
-- 말했다). 한도는 깎였지만 이 도구는 일을 하지 못했다. 두 경우에 고치는 길이 다르다 —
-- 거절은 모델을 바꿔야 하고, 실패는 다시 시도하면 된다. 한 값으로 합치면 둘 다 "모델 문제"
-- 로만 보인다.

-- CreateTable
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- 하룻값 집계는 항상 "이 팀 · 이 날 · 이 도구" 로 묶인다. `AiUsage` 의 첫 인덱스와 같다.
CREATE INDEX "AiCall_teamId_day_tool_idx" ON "AiCall"("teamId", "day", "tool");

CREATE INDEX "AiCall_memberId_day_idx" ON "AiCall"("memberId", "day");

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCall" ADD CONSTRAINT "AiCall_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
