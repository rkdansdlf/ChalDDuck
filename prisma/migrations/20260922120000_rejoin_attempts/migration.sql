-- 재입장 코드 시도 횟수를 프로세스 메모리에서 표로 옮긴다.
-- 서버리스는 요청마다 다른 인스턴스가 받을 수 있어, 메모리 카운터는 인스턴스 수만큼
-- 시도를 늘려 주는 것과 같았다.
CREATE TABLE "RejoinAttempt" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "until" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RejoinAttempt_pkey" PRIMARY KEY ("key")
);
