-- 제출함 마감을 시각으로 둔다. "마감 후 제출"은 이 값으로 그때그때 계산한다.
ALTER TABLE "SubmissionBox" ADD COLUMN "dueAt" TIMESTAMP(3);

-- 복원으로 생긴 버전 표시 — 늦은 제출·용량 계산에서 뺀다.
ALTER TABLE "FileVersion" ADD COLUMN "restoredFromId" TEXT;

-- 저장된 시각 문자열은 더 이상 쓰지 않는다(createdAt 으로 만든다). 지우기 전 단계로 비워 둘 수 있게.
ALTER TABLE "FileVersion" ALTER COLUMN "whenLabel" DROP NOT NULL;
