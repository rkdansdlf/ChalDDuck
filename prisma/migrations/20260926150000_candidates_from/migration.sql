-- 회의 후보를 "어느 주"가 아니라 "어느 날부터 7일"로 만든다(주말이 들어오면서).
-- 값의 뜻이 바뀌므로 옮기지 않고 비운다 — 비어 있으면 다음에 09 를 열 때 다시 만든다.
ALTER TABLE "Team" RENAME COLUMN "candidatesWeek" TO "candidatesFrom";
UPDATE "Team" SET "candidatesFrom" = NULL;
