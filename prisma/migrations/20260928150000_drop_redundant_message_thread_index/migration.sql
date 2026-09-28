-- `@@index([teamId, threadKey])` 은 `@@index([teamId, threadKey, createdAt])` 의 접두사다.
-- b-tree 는 왼쪽부터 쌓이므로 (teamId, threadKey) 만 걸는 질문은 더 긴 인덱스로도 그대로
-- 답할 수 있다. **짧은 쪽은 읽히지 않았다.**
--
-- 50,040행으로 늘려 실제로 비교했다. 대표 여섯 질문 — 폴링 ① 팀 대화 마지막 말 ② 스레드별
-- 마지막 말 ③ 안 읽은 수, 대화 열기 ④ 과거 페이징 ⑤ 새 것, ⑥ (teamId, threadKey) 만 묶는
-- 집계 — 의 **계획과 읽은 행이 제거 전후에 완전히 같았다.**
--
-- 쓰지 않는 인덱스를 두는 대가는 메시지가 늘어날 때마다 쓰기가 한 번 더 가는 것이다.
DROP INDEX IF EXISTS "Message_teamId_threadKey_idx";
