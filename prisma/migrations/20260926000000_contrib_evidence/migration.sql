-- 23 기여 기록의 근거 파일. `hasEvidence` 는 파일 없이 true 가 될 수 있던 값이라 지운다 —
-- 실제로 true 인 행은 없었다(서버가 44 커밋부터 받지 않았다). 근거가 있는지는 이제 경로로 안다.
ALTER TABLE "ContribRecord" DROP COLUMN "hasEvidence",
ADD COLUMN     "evidenceBytes" INTEGER,
ADD COLUMN     "evidenceMime" TEXT,
ADD COLUMN     "evidenceName" TEXT,
ADD COLUMN     "evidencePath" TEXT;
