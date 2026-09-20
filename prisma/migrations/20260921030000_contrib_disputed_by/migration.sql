-- 의견을 적은 사람. 이름을 의견 본문에서 떼어내 쓰면 본문이 통째로 이름 자리에 들어간다
-- (실제로 그렇게 보였다).
ALTER TABLE "ContribRecord" ADD COLUMN "disputedById" TEXT;

ALTER TABLE "ContribRecord" ADD CONSTRAINT "ContribRecord_disputedById_fkey"
  FOREIGN KEY ("disputedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
