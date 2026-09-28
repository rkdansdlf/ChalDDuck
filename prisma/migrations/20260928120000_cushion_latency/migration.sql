-- 순화 호출이 얼마나 걸렸는지를 남긴다.
--
-- "free: usable 41% / model A: usable 91%" 처럼 **모델을 고르는 판단은 숫자로 해야 한다.**
-- 성공률뿐 아니라 **느린지**도 알아야 한다. 지연이 없으면 "느려서 안 쓰는 것" 과
-- "못 해서 안 쓰는 것" 을 구분할 수 없다.

-- AlterTable
ALTER TABLE "MessageCushion" ADD COLUMN "latencyMs" INTEGER;
