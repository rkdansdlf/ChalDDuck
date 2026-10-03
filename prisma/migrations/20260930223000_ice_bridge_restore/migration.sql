-- 다리 복원을 **실제로** 한다.
--
-- ## 앞선 마이그레이션이 틀렸던 이유
--
-- `20260930210000_ice_legacy_vote_bridge` 는 이렇게 썼다.
--
-- ```sql
-- INSERT INTO "IceSeat" ("roundId","memberId","voteForId") SELECT … FROM "IceBallot" …
-- ON CONFLICT DO NOTHING;
-- ```
--
-- `IceSeat` 의 키는 `(roundId, memberId)` 이고 **그 자리는 이미 전부 있다**(역할이 배정된 판).
-- 그래서 `INSERT` 는 모든 행에서 키 충돌이 나고 `DO NOTHING` 이 되어 **추가된 `voteForId` 는 NULL
-- 그대로 남았다.** 주석은 "진행 중인 판의 표를 되돌린다" 였지만 실제로는 아무것도 하지 않았다.
--
-- ⚠️ 이 검사는 당시 **소스 정규식**(`/FROM "IceBallot"/`)이었다. SQL 이 표를 "읽는다" 고만 했지,
--    실제로 **행을 고치는지** 보지 않았다. 마이그레이션은 실제 DB 로 한 번씩 돌려야 한다.
--
-- 적용된 마이그레이션은 고칠 수 없으므로(체크섬이 달라진다) 정정본이 따로 필요하다.
--
-- ## ① 표가 있는 자리를 채운다
--
-- 판의 **마지막 투표 회차**(`voteSeq`) 표를 다리 칸에 그대로 쓴다. 구버전 인스턴스가 이 판을 마감하면
-- 그 표로 세야 한다.
--
-- ⚠️ 이 마이그레이션은 **스스로 컬럼을 지킨다.** 앞선 `20260930210000` 이 그 컬럼을 추가하지만,
--    그 마이그레이션이 적용되지 않은 경로(부분 적용 · 실패 후 복구)에서 이 파일만 먼저 도는 일이
--    있다. 그때 아래 `UPDATE` 는 **column does not exist** 로 죽는다. 실제로 경로 검사에서 걸렸다.
ALTER TABLE "IceSeat" ADD COLUMN IF NOT EXISTS "voteForId" TEXT;

-- ## ② 표가 없는 자리는 비운다
--
-- 이것도 필요하다. 다리 칸에 **지난 회차**의 표가 남아 있으면, 구버전이 마감할 때 그 표까지 세고
-- 결선 밖의 사람이 탈락할 수 있다. 다리 칸은 언제나 "지금 회차의 표" 와 같아야 한다.
UPDATE "IceSeat" s
SET "voteForId" = b."targetId"
FROM "IceBallot" b
JOIN "IceRound" r ON r."id" = b."roundId" AND r."voteSeq" = b."seq"
WHERE b."roundId" = s."roundId" AND b."memberId" = s."memberId";

UPDATE "IceSeat" s
SET "voteForId" = NULL
WHERE s."voteForId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "IceBallot" b
    JOIN "IceRound" r ON r."id" = b."roundId" AND r."voteSeq" = b."seq"
    WHERE b."roundId" = s."roundId" AND b."memberId" = s."memberId"
  );