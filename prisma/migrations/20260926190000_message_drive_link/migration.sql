-- 채팅과 드라이브를 잇는다. 두 방향 모두 **바이트를 복사하지 않는다**.
--
-- 공유(드라이브 → 채팅): 저장소 객체를 다시 올리지 않고 그 버전만 가리킨다.
--   용량 계산이 두 번 세지 않고, 드라이브에 새 버전도 생기지 않는다.
-- 저장(채팅 → 드라이브): 이미 올라간 객체를 가리키는 버전을 제출함에 하나 세운다.
--
-- 둘 다 비어 있다 — 지금 있는 말에는 연결이 없으므로 값을 채울 필요가 없다.
ALTER TABLE "Message" ADD COLUMN "driveVersionId" TEXT;
ALTER TABLE "Message" ADD COLUMN "savedVersionId" TEXT;

-- 버전이 지워져도 **말은 남는다**( 자리만 비는다). 드라이브 기록을 지울 권한은 없지만
-- 없어진 파일을 가리키는 말을 함께 지우는 것은 팀의 대화를 조용히 없애는 일이 된다.
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_driveVersionId_fkey"
  FOREIGN KEY ("driveVersionId") REFERENCES "FileVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_savedVersionId_fkey"
  FOREIGN KEY ("savedVersionId") REFERENCES "FileVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
