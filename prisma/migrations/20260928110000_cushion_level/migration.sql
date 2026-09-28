-- 읽기 순화에 "강도" 를 넣는다: 끄기(enabled)와 단계(mode LIGHT/NORMAL/STRONG).
--
-- 끄기와 단계는 한 칸이 아니라 둘이다. 한 칸이면 `mode="OFF"` 로 바꿀 때 **이전에 고른 단계를
-- 잃는다** — 다시 켰을 때 어디까지 세게 읽을지 몰라 처음부터 골라야 한다.
-- `enabled=false` 이면 `mode` 는 그대로 남는다.

-- AlterTable
ALTER TABLE "ReadCushion" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'NORMAL';
