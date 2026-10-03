-- 07 역할 추첨을 **팀이 시작해도 된다고 동의한** 기록을 두 모델로 세운다.
--
-- `RoleDraw` 가 생기기 전에는 아무 팀원이나 그 역할의 추첨을 시작할 수 있었다. 동료 한 명이
-- 자기 손으로 나머지를 "받기 대기" 에 넣었고, 싫은 쪽에게 남는 길은 거절뿐이었다.
--
-- 회의 제안(`MeetingProposal` · `MeetingResponse`)과 같은 형태다 — 누군가 제안하고, 응답
-- 마감을 두고, **누구든 반대하면 확정되지 않으며**, 마감까지 아무도 반대하지 않으면 저절로
-- 통과한다.
--
-- ## 왜 `stage` 열이 없는가
--
-- 회의는 마감 뒤 **예약 작업이 확정**해야 한다(`confirmDueMeetings`) — 리포트가 그 값을
-- 읽으니까. 추첨은 그렇지 않다. **추첨은 사람이 누르는 순간** 일어나야 하고 예약 작업이 대신
-- 뽑을 수는 없다. 그래서 통과 여부를 저장하지 않고 `respondBy > now` 로 읽을 때마다 계산한다.
-- 지연된 스케줄러가 늦게 돌아도 사용자가 잘못된 상태를 보지 않는다.
--
-- ## `activeKey` 를 두는 이유
--
-- 같은 역할에 제안이 두 개 서는 것을 DB 에서 막는다. `${teamId}:${role}` 을 담아 두면 화면은
-- "이 역할은 이미 동의를 받고 있다"를 조회만으로 알 수 있다.

-- 통과 여부는 저장하지 않는다. `respondBy` 가 지나면 저절로 통과한 것으로 계산된다.
CREATE TABLE "RoleDrawConsent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "activeKey" TEXT NOT NULL,
    "respondBy" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleDrawConsent_pkey" PRIMARY KEY ("id")
);

-- 같은 역할에 두 번째 제안이 서지 않는다.
CREATE UNIQUE INDEX "RoleDrawConsent_activeKey_key" ON "RoleDrawConsent"("activeKey");

-- "이 팀의 제안 목록" 조회용.
CREATE INDEX "RoleDrawConsent_teamId_role_idx" ON "RoleDrawConsent"("teamId", "role");

-- **반대는 이 표에 남지 않는다.** 반대가 오면 제안 행이 삭제된다(회의와 같은 자리).
-- 저장하면 "반대했다"가 영구히 남는데, 화면은 반대를 죽은 제안으로만 말하고 되돌릴 길이 없다.
CREATE TABLE "RoleConsentResponse" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "agree" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleConsentResponse_pkey" PRIMARY KEY ("id")
);

-- 한 사람은 같은 제안에 한 번만 답한다. 재응답은 갱신이 된다.
CREATE UNIQUE INDEX "RoleConsentResponse_consentId_memberId_key" ON "RoleConsentResponse"("consentId", "memberId");

ALTER TABLE "RoleDrawConsent"
    ADD CONSTRAINT "RoleDrawConsent_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleDrawConsent"
    ADD CONSTRAINT "RoleDrawConsent_proposedById_fkey"
    FOREIGN KEY ("proposedById") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleConsentResponse"
    ADD CONSTRAINT "RoleConsentResponse_consentId_fkey"
    FOREIGN KEY ("consentId") REFERENCES "RoleDrawConsent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoleConsentResponse"
    ADD CONSTRAINT "RoleConsentResponse_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;