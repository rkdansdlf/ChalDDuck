-- 읽기 순화를 "결과 저장소"에서 "상태 머신"으로 바꾼다.
--
-- 예전 표는 `행이 있다 = 순화 성공`, `행이 없다 = 실패 또는 아직 안 함` 이었다. 그래서
-- **거절된 말도 지워진 게 아니라 "아직 없는 것"** 으로 남아 3초마다 AI 후보가 되었고,
-- 새로고침하면 브라우저의 "시도함" 기록까지 리셋되어 하루치 한도가 몇 분 만에 Gone 이 되었다.
--
-- 이 표를 통째로 다시 만든다. 여기 들어 있던 것은 **읽기에만 걸린 파생 데이터** 라서 원문
-- (`Message.text`)은 어디에도 영향이 없고, 필요하면 언제든 다시 만들어진다.

DROP TABLE IF EXISTS "MessageCushion";

-- CreateTable
CREATE TABLE "MessageCushion" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "text" TEXT,
    "source" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "validatorVersion" TEXT,
    "sourceHash" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'soft',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "retryAfter" TIMESTAMP(3),
    "claimToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageCushion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageCushion_messageId_viewerId_key" ON "MessageCushion"("messageId", "viewerId");

-- CreateIndex
-- 실패 캐시 조회: "이 사람에게 이미 뭐가 붙어 있는가" 를 id 목록으로 한 번에 본다.
CREATE INDEX "MessageCushion_viewerId_status_idx" ON "MessageCushion"("viewerId", "status");

-- AddForeignKey
ALTER TABLE "MessageCushion" ADD CONSTRAINT "MessageCushion_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCushion" ADD CONSTRAINT "MessageCushion_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
