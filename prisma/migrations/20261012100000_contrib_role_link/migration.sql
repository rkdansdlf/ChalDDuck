-- AlterTable
ALTER TABLE "ContribRecord" ADD COLUMN     "roleKey" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "role" TEXT;

-- CreateIndex
CREATE INDEX "ContribRecord_memberId_roleKey_idx" ON "ContribRecord"("memberId", "roleKey");

-- 이미 쌓인 드라이브 기록은 올린 제출함의 역할을 물려받는다. 새 칸만 채우고 다른 값은 건드리지 않는다.
-- (할 일 기록은 `Task.role` 이 방금 생긴 칸이라 채울 값이 없다.)
UPDATE "ContribRecord" AS c
SET "roleKey" = b."role"
FROM "FileVersion" AS v
JOIN "SubmittedFile" AS f ON f."id" = v."fileId"
JOIN "SubmissionBox" AS b ON b."id" = f."boxId"
WHERE c."originType" = 'drive_version'
  AND c."originId" = v."id";
