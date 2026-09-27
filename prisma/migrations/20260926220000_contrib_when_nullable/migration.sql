-- `ContribRecord.whenLabel` 을 필수에서 선택으로.
--
-- 이 칸에는 사람이 적은 설명("9/8 – 9/12")만 들어간다. 언제 추가했는지는 `createdAt` 이
-- 말하고, 화면이 읽을 때 그때그때 "방금"·"3주 전" 을 만든다. 예전에는 넣는 순간
-- "방금" 을 문자열로 저장해서, 석 달 전에 추가한 기록도 계속 "방금" 이었다.
--
-- 이미 "방금" 으로 굳은 행은 비운다 — 저장된 순간의 말로 굳어 있는 것이니 지우는 편이
-- 정확하다. `createdAt` 이 그 시점을 그대로 기억하고 있다.
UPDATE "ContribRecord" SET "whenLabel" = NULL WHERE "whenLabel" = '방금';

ALTER TABLE "ContribRecord" ALTER COLUMN "whenLabel" DROP NOT NULL;
