-- 온보딩에서 받은 생년월일(시)을 승인 전까지 가입 요청에 들고 있는다.
--
-- 왜: 가입 요청은 아직 `Member` 가 아니라서, 온보딩에서 고른 값(MBTI·희망 역할)을 여기 들고 있다가
-- 승인되는 순간 `Member` 로 옮긴다. 사주를 위한 생년월일도 같은 길을 탄다(`Member.birthDate/birthTime`
-- 은 20261009030000_member_birth).
--
-- 개인정보라서 두 가지를 지킨다: ① 요청이 **거절되면 지운다**(요청 행은 감사 근거로 남지만 생일은
-- 기록이 아니다 — `settleJoinRequest`). ② 서버가 형식·범위를 검사한 값만 저장한다.
--
-- 기존 행은 NULL — 아직 아무도 사주를 입력하지 않았다. 입력은 선택이다.

-- AlterTable
ALTER TABLE "JoinRequest" ADD COLUMN "birthDate" TEXT,
ADD COLUMN "birthTime" TEXT;
