-- DM 목록 폴링이 "이 대화의 마지막 말 한 개" 를 찾을 수 있게 한다.
--
-- 예전 인덱스는 `(teamId, threadKey)` 뿐이었다. 폴링이 요구하는 정렬은
-- `(teamId, threadKey, createdAt DESC)` 이므로 Postgres 는 **그 대화의 전체 메시지**를 읽고
-- 앞에서 잘라야 했다. DM 이 쌓일수록 4초마다의 비용이 그대로 오른다 — "팀원 수와 무관하게
-- 쿼리 4개로 고정된다" 고 적어 둔 주석과 달리, 행 개수는 고정되지 않았다.
--
-- 시간이 거꾸로 흐르는 곳이 아니라 위 인덱스를 그대로 둔다. 기존 인덱스도 남긴다 —
-- 목록이 아니라 "이 대화의 모든 말" 을 읽을 때(과거 스크롤) 여전히 쓰인다.
CREATE INDEX "Message_teamId_threadKey_createdAt_idx" ON "Message"("teamId", "threadKey", "createdAt");
