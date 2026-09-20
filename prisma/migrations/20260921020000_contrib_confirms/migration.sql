-- 기여 기록에 대한 팀원 확인.
CREATE TABLE "ContribConfirm" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContribConfirm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContribConfirm_recordId_memberId_key" ON "ContribConfirm"("recordId", "memberId");
CREATE INDEX "ContribConfirm_recordId_idx" ON "ContribConfirm"("recordId");

ALTER TABLE "ContribConfirm" ADD CONSTRAINT "ContribConfirm_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "ContribRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContribConfirm" ADD CONSTRAINT "ContribConfirm_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 이미 `ok` 인 기록은 팀원이 확인해 준 것이다. 확인 행이 없으면 다음 계산에서
-- "0명 확인"으로 떨어지므로, 본인을 뺀 같은 팀 사람들을 확인자로 채워 둔다.
INSERT INTO "ContribConfirm" ("id", "recordId", "memberId", "createdAt")
SELECT md5(r.id || ':' || other.id), r.id, other.id, r."createdAt"
FROM "ContribRecord" r
JOIN "Member" owner ON owner.id = r."memberId"
JOIN "Member" other ON other."teamId" = owner."teamId" AND other.id <> owner.id
WHERE r.state = 'ok';

-- 확인 수와 적힌 의견에서 다시 계산하므로 저장해 둔 표시 문자열은 더 이상 쓰지 않는다.
ALTER TABLE "ContribRecord" DROP COLUMN "byLabel";
