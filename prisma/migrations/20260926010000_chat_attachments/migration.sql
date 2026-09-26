-- 단톡방 첨부 파일. 파일만 보낸 말은 text 가 빈 문자열이다.
ALTER TABLE "Message" ADD COLUMN     "attachBytes" INTEGER,
ADD COLUMN     "attachMime" TEXT,
ADD COLUMN     "attachName" TEXT,
ADD COLUMN     "attachPath" TEXT;
