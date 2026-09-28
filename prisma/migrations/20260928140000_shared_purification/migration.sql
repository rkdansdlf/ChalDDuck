-- 읽기 순화를 (말, 읽는 사람) 에서 (말, 읽기 설정) 으로 합친다.
--
-- 예전 표는 팀원 5명이 방에서 같이 읽으면 **같은 말을 5번** 모델에 불렀다(AI 한도 1회씩).
-- 팀플이 4~5명이라는 이 앱의 상황에서 가장 큰 낭비였다. 순화 결과는 **읽는 사람이 아니라
-- 읽기 조건(강도·말투·프롬프트·모델·검사기)에 따라** 결정되므로 그 조건을 열쇠로 삼는다.
--
-- 사람이 열쇠에서 빠지면서 **실패 캐시도 사람 사이에 공유된다** — 한 사람이 거절당하면 그
-- 사유·시도 횟수·재시도 시각이 그대로 전달되므로 5명이 각자 거절을 시도하지 않는다.
--
-- 사람이 별도로 "무엇을 보여 줄지" 를 고르는 기능이 생기면 그때 두 번째 표가 돌아온다.
-- 지금은 그 선택이 없으므로 표가 하나여야 중복 계산이 없다.
--
-- 이 파일은 **부분 적용에도 안전하다.** Postgres 에서 표를 이름을 바꾸면 인덱스·제약 이름은
-- 그대로 남고, 실패한 시도가 이름을 바꾸고 멈출 수 있다. 그래서 각 단계를 확인해 건다.

DO $$
BEGIN
  IF to_regclass('"MessageCushion"') IS NOT NULL AND to_regclass('"MessagePurification"') IS NULL THEN
    EXECUTE 'ALTER TABLE "MessageCushion" RENAME TO "MessagePurification"';
  END IF;
END $$;

-- 사람 열이 열쇠에서 빠진다. 이 열에 걸린 바깥 키 제약도 함께 사라진다.
ALTER TABLE "MessagePurification" DROP COLUMN IF EXISTS "viewerId";

-- 결과를 바꾸는 조건을 담는 열들.
ALTER TABLE "MessagePurification" ADD COLUMN IF NOT EXISTS "policyHash" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "MessagePurification" ADD COLUMN IF NOT EXISTS "level" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "MessagePurification" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;

-- 개발 중 쌓인 파생 데이터다. 지문이 없는(`legacy`) 행은 더 이상 아무도 쓰지 않으므로 지운다.
DELETE FROM "MessagePurification" WHERE "policyHash" = 'legacy';

-- 열쇠: (말, 읽기 설정)
DROP INDEX IF EXISTS "MessageCushion_messageId_viewerId_key";
DROP INDEX IF EXISTS "MessageCushion_messageId_memberId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "MessagePurification_messageId_policyHash_key"
  ON "MessagePurification"("messageId", "policyHash");

-- 실패 캐시 조회: "이 말이 이미 어떻게 됐나" 를 id 목록으로 한 번에 본다.
DROP INDEX IF EXISTS "MessageCushion_viewerId_status_idx";
CREATE INDEX IF NOT EXISTS "MessagePurification_messageId_idx" ON "MessagePurification"("messageId");

-- 바깥 키 이름도 옛 이름(`MessageCushion_...`)으로 남아 있다. Postgres 에서 표 이름을 바꾸어도
-- 제약 이름은 따라가지 않는다(바깥 키는 인덱스 표가 아니라 `pg_constraint` 에 있으므로
-- DROP INDEX 로도 안 없어진다).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageCushion_messageId_fkey') THEN
    EXECUTE 'ALTER TABLE "MessagePurification" RENAME CONSTRAINT "MessageCushion_messageId_fkey" TO "MessagePurification_messageId_fkey"';
  END IF;
END $$;

-- 2026-09-28 · 기본값 제거
-- 기본값은 "값을 안 적어 넣으면 이래" 이다. 이 표는 **순화 결과**라 값이 없으면 거짓말이 된다.
-- `model`/`promptVersion`/`validatorVersion` 가 비면 "누가 어느 설정으로 만들었나" 를 알 수 없다.
-- 예전에 비어 있던 개발 데이터가 남아 열이 필수로 바뀌지 못했으므로 지운 뒤 다시 만든다.
DELETE FROM "MessagePurification";

ALTER TABLE "MessagePurification" ALTER COLUMN "model" SET NOT NULL;
ALTER TABLE "MessagePurification" ALTER COLUMN "promptVersion" SET NOT NULL;
ALTER TABLE "MessagePurification" ALTER COLUMN "validatorVersion" SET NOT NULL;
ALTER TABLE "MessagePurification" ALTER COLUMN "tone" DROP DEFAULT;
ALTER TABLE "MessagePurification" ALTER COLUMN "policyHash" DROP DEFAULT;
ALTER TABLE "MessagePurification" ALTER COLUMN "level" DROP DEFAULT;

-- 주키 이름도 옛 이름(`MessageCushion_pkey`)이다. 이름이 다른 제약은 프리즈마가
-- "이름이 다른 다른 제약" 으로 보고 스키마와 불일치로 친다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageCushion_pkey') THEN
    EXECUTE 'ALTER TABLE "MessagePurification" RENAME CONSTRAINT "MessageCushion_pkey" TO "MessagePurification_pkey"';
  END IF;
END $$;
