-- 회의 제안에 **장소 · 안건 · 소요 시간**을 붙인다.
--
-- 이 세 컬럼은 `schema.prisma` 에는 있었지만 마이그레이션이 없어서 DB 에 없는 상태였다
-- (`db:check` 이 `[+] Added column` 로 잡았다). 코드는 이미 이 값을 읽고 쓰고 있으므로
-- 배포하면 읽는 순간 P2022 로 죽는다.
--
-- 자정 이벤트가 아니라 **제안자가 고른 값**이라 확정된 회의의 리포트에 그대로 실린다. 그래서
-- 기본값이 필요하다 — 이미 서 있는 제안은 소요 시간을 모른다.

-- 회의 장소 (오프라인 회의실 또는 온라인 URL).
ALTER TABLE "MeetingProposal" ADD COLUMN "location" TEXT;

-- 회의 안건.
ALTER TABLE "MeetingProposal" ADD COLUMN "agenda" TEXT;

-- 회의 소요 시간(분). 기본 60분.
ALTER TABLE "MeetingProposal" ADD COLUMN "durationMinutes" INTEGER NOT NULL DEFAULT 60;