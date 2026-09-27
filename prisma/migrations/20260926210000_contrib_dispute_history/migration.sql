-- 의견의 이력. 덮어쓰지 않는다.
--
-- `ContribRecord.dispute` 는 "지금 떠 있는 의견" 하나만 담는다. 예전에는 의견이 다시 달리면
-- `update` 가 이 칸을 그냥 덮어썼고, 그 과정에서 앞선 의견과 이미 합의된 정정 내용까지
-- 함께 지워졌다 — 17 화면이 "한쪽 말로 덮지 않고 둘 다 남깁니다"라고 약속한 것과 정면으로
-- 어긋난다. 스키마 주석은 이미 이 규칙을 적어 놓았는데 코드가 지키지 않았다.
--
-- 정리는 되돌릴 수 없으니 의견 자체는 이력으로 남긴다. 화면은 시간순으로 모두 보여 준다.
CREATE TABLE "ContribDispute" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "byId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContribDispute_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContribDispute_recordId_createdAt_idx" ON "ContribDispute"("recordId", "createdAt");

ALTER TABLE "ContribDispute"
  ADD CONSTRAINT "ContribDispute_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "ContribRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContribDispute"
  ADD CONSTRAINT "ContribDispute_byId_fkey"
  FOREIGN KEY ("byId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 정리된 기록에 달린 **현재** 의견도 이력 첫 줄로 옮긴다. 지금 있는 `dispute` 값을
-- 지우지 않는다 — 새 코드가 켜졌을 때 이미 적힌 의견이 사라져 보이면 안 된다.
INSERT INTO "ContribDispute" ("id", "recordId", "byId", "text", "createdAt")
SELECT
  'migrated-' || md5(r."id" || '-' || r."disputedById"),
  r."id",
  r."disputedById",
  r."dispute",
  r."createdAt"
FROM "ContribRecord" r
WHERE r."dispute" IS NOT NULL AND r."disputedById" IS NOT NULL;
