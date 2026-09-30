-- 투표를 **기록**한다. (`IceSeat.voteForId` → `IceBallot`)
--
-- ## 무엇이 틀렸는가
--
-- 1) **지난 투표가 사라졌다.** `voteForId` 는 "지금 고른 사람" 한 칸이었다. 투표를 마감하면 비우고,
--    밤에 죽은 사람에게 던진 표는 지웠다. 그래서 판이 끝나면 **"누가 누구에게 표를 던졌는가" 의
--    마지막 기록조차 없다** — 결과 화면의 "마지막 투표" 는 그 한 번만 남는다.
--
-- 2) **동점이면 표를 전부 버렸다.** 같은 사람들이 같은 이야기를 다시 하고 같은 동점이 되기를
--    반복했다. 결선이 없었다 — 동점자끼리만 다시 고르면 할 말이 생기는데, 그 길이 없었다.
--
-- ## 왜 자리에 둔 표를 없애는가
--
-- `IceSeat` 의 현재 표와 `IceBallot` 의 기록이 **둘 다 있으면 어느 쪽이 진짜인지 알 수 없다.**
-- 하나만 남긴다. 자리의 `voteForId` 는 마감하면 사라지는 값이라 기록이 될 수 없다.
--
-- ⚠️ **진행 중인 판의 표는 옮긴다.** 아래 `INSERT` 가 `voteForId` 가 있는 모든 자리를 1회차
-- 투표로 옮긴다. 이게 없으면 배포 순간 투표 중인 판의 표가 조용히 사라지고, 사람들이 고른 사람이
-- 보이지 않는다.
--
-- ## 결선을 위한 두 값
--
-- - `voteSeq` — 이 판에서 투표가 몇 번째 회차인가. **늘어만 난다** — 밤이 지나도 되돌아가지
--   않는다. 되돌아가면 그날 표와 오늘 표가 같은 키에 부딪혀 서로를 지운다.
-- - `eligibleTargets` — 지금 고를 수 있는 사람. 비어 있으면 "살아 있는 다른 사람 전부" 다
--   (결선이 아닌 보통 투표). 결선에서는 동점자만 들어 있다.
ALTER TABLE "IceRound" ADD COLUMN "voteSeq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "IceRound" ADD COLUMN "eligibleTargets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "IceBallot" (
    "roundId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "memberId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "IceBallot_pkey" PRIMARY KEY ("roundId","seq","memberId")
);

-- 한 회차의 표를 한 번에 읽는다(집계·마감·결선 대상 계산).
CREATE INDEX "IceBallot_roundId_seq_idx" ON "IceBallot"("roundId", "seq");

-- 누가 누구에게 표를 던졌는지 — 기록을 남기는 이유이자, 타임라인이 읽을 자리.
CREATE INDEX "IceBallot_roundId_memberId_idx" ON "IceBallot"("roundId", "memberId");

ALTER TABLE "IceBallot" ADD CONSTRAINT "IceBallot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "IceRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ⑴ 진행 중이던 판의 표를 1회차로 옮긴다.
INSERT INTO "IceBallot" ("roundId", "seq", "day", "memberId", "targetId")
SELECT s."roundId", 1, r."day", s."memberId", s."voteForId"
FROM "IceSeat" s
JOIN "IceRound" r ON r."id" = s."roundId"
WHERE s."voteForId" IS NOT NULL;

-- ⑵ 옮겼으니 자리의 현재 표는 지운다 — 기록이 두 벌이 되지 않게.
ALTER TABLE "IceSeat" DROP COLUMN "voteForId";

-- ⑶ 위에서 옮긴 표가 1회차 투표다 — 해당 판의 회차를 1로 맞춘다.
UPDATE "IceRound" SET "voteSeq" = 1
WHERE "voteSeq" = 0 AND EXISTS (SELECT 1 FROM "IceBallot" b WHERE b."roundId" = "IceRound"."id");
