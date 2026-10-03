-- 동의 제안을 **역할당 하나**로 줄인다.
--
-- `activeKey` 는 "같은 역할에 제안이 두 개 서는 것"을 막으려고 뒀었다. 그런데 역할마다 행이
-- 하나면 그 역할은 유니크 인덱스 하나로 지킬 수 있고, **마감을 지난 제안을 새 제안으로
-- 재사용할 수 있다** — `activeKey` 를 두면 마감을 지난 행이 키를 붙잡고 있어 다음 제안이
-- 막힌다(비우려면 `activeKey` 를 nullable 로 만들어야 하고, 그러면 마감 뒤에 값을 바꿔주는
-- 예약 작업이 다시 필요하다).
--
-- 행을 늘리지 않는 게 맞다. 도구와 당첨자는 `RoleDraw` 에 남으므로 여기서 지울 것은 없고,
-- "이 팀이 이 역할에 몇 번 제안했나" 를 답할 질문만 생긴다.
--
-- `RoleDraw` 도 역할마다 하나(`@@unique([teamId, role])`)다. 같은 모양으로 맞춘다.

-- ⚠️ `220000_role_draw_consent` 가 이 인덱스를 **CREATE UNIQUE INDEX** 로 만들었다.
--   Postgres 에서 `CREATE UNIQUE INDEX` 는 제약이 아니라 인덱스다 — 그래서 `DROP CONSTRAINT`
--   로 지우면 `42704 … does not exist` 로 죽는다(실제로 이 마이그레이션이 그렇게 실패했다).
DROP INDEX "RoleDrawConsent_activeKey_key";
ALTER TABLE "RoleDrawConsent" DROP COLUMN "activeKey";

-- `(teamId, role)` 을 건 인덱스는 유니크 제약이 이미 역할을 한다.
DROP INDEX "RoleDrawConsent_teamId_role_idx";

-- "이 팀의 제안 목록" 조회용.
CREATE INDEX "RoleDrawConsent_teamId_idx" ON "RoleDrawConsent"("teamId");

-- 같은 역할에 두 번째 제안이 서지 않는다.
ALTER TABLE "RoleDrawConsent" ADD CONSTRAINT "RoleDrawConsent_teamId_role_key"
    UNIQUE ("teamId", "role");