-- 이 단말의 푸시 구독. 앱을 닫아 있어도 알림이 닿는 통로다.
-- endpoint 가 구독의 신분이라 유일하게 둔다 — 같은 단말이 다시 구독하면 행을 쌓지 않는다.
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_memberId_idx" ON "PushSubscription"("memberId");

ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "Member"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
