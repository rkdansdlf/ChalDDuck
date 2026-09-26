-- 안 되는 시간을 "이 주만"으로 적을 수 있게 한다. null 은 매주.
ALTER TABLE "BusyBlock" ADD COLUMN "weekOf" TEXT;

-- 회의 후보를 어느 주의 시간표로 만들었는지. 주가 바뀌면 다시 만든다.
ALTER TABLE "Team" ADD COLUMN "candidatesWeek" TEXT;
