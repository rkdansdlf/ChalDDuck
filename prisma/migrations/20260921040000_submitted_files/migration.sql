-- 제출함과 버전 사이에 "파일" 단계를 넣는다. 한 제출함에 파일이 여러 개일 수 있고,
-- 버전은 그 파일 하나의 역사다.
CREATE TABLE "SubmittedFile" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmittedFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubmittedFile_boxId_idx" ON "SubmittedFile"("boxId");
ALTER TABLE "SubmittedFile" ADD CONSTRAINT "SubmittedFile_boxId_fkey"
  FOREIGN KEY ("boxId") REFERENCES "SubmissionBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 지금까지는 제출함마다 대표 파일이 하나였다. 그 이름으로 파일을 하나씩 만든다.
INSERT INTO "SubmittedFile" ("id", "boxId", "name", "kind", "createdAt")
SELECT 'file_' || b.id, b.id, b."fileName",
       COALESCE((SELECT v.kind FROM "FileVersion" v WHERE v."boxId" = b.id ORDER BY v."createdAt" DESC LIMIT 1), 'docx'),
       CURRENT_TIMESTAMP
FROM "SubmissionBox" b;

-- 버전을 제출함이 아니라 파일에 매단다.
ALTER TABLE "FileVersion" ADD COLUMN "fileId" TEXT;
UPDATE "FileVersion" v SET "fileId" = 'file_' || v."boxId";
ALTER TABLE "FileVersion" ALTER COLUMN "fileId" SET NOT NULL;

ALTER TABLE "FileVersion" DROP CONSTRAINT "FileVersion_boxId_fkey";
DROP INDEX "FileVersion_boxId_idx";
ALTER TABLE "FileVersion" DROP COLUMN "boxId";

CREATE INDEX "FileVersion_fileId_idx" ON "FileVersion"("fileId");
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "SubmittedFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 실제 파일이 저장소에 올라가면 채워진다. 시드 데이터는 비어 있다.
ALTER TABLE "FileVersion" ADD COLUMN "storagePath" TEXT;
ALTER TABLE "FileVersion" ADD COLUMN "bytes" INTEGER;
ALTER TABLE "FileVersion" ADD COLUMN "mimeType" TEXT;

-- 대표 파일 이름은 이제 파일 표에 있다.
ALTER TABLE "SubmissionBox" DROP COLUMN "fileName";
