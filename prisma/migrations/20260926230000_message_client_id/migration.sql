-- 말에 화면이 미리 만들어 둔 id 를 붙인다.
--
-- 서버가 저장했는데 응답이 늦어 화면이 "전송 실패"로 바꾸고, 사용자가 "다시 보내기"를 누르면
-- 같은 말이 두 개 생겼다. 첨부는 `attachPath` 로 막고 있었지만 글에는 그런 표가 없어서였다.
-- 같은 사람이 같은 `clientId` 로 두 번 보내면 한 번만 저장한다.
--
-- 기존 행에는 값이 없다. Postgres 의 유일 인덱스는 NULL 을 서로 다른 값으로 보므로
-- 기존 메시지끼리는 충돌하지 않는다.
ALTER TABLE "Message" ADD COLUMN "clientId" TEXT;

CREATE UNIQUE INDEX "Message_authorId_clientId_key" ON "Message"("authorId", "clientId");
