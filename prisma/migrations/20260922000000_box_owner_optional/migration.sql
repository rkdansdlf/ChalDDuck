-- 새로 만든 팀은 역할이 정해지기 전이라 제출함 주인이 없다. 주인 없이도 칸은 있어야
-- 파일을 올릴 수 있다(예전에는 새 팀의 드라이브가 빈 화면이었다).
ALTER TABLE "SubmissionBox" DROP CONSTRAINT "SubmissionBox_ownerId_fkey";
ALTER TABLE "SubmissionBox" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "SubmissionBox" ADD CONSTRAINT "SubmissionBox_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
