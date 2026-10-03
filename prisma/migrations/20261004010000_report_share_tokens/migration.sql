-- 기여도 리포트 공개 공유 토큰 (ReportShareToken)
-- 교수 제출용 및 팀 내부 점검용 성적 증빙 리포트를 외부에서 로그인 없이 열람할 수 있는 토큰

CREATE TABLE "ReportShareToken" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'professor',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ReportShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportShareToken_token_key" ON "ReportShareToken"("token");
CREATE INDEX "ReportShareToken_teamId_idx" ON "ReportShareToken"("teamId");
CREATE INDEX "ReportShareToken_token_idx" ON "ReportShareToken"("token");

ALTER TABLE "ReportShareToken" ADD CONSTRAINT "ReportShareToken_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReportShareToken" ADD CONSTRAINT "ReportShareToken_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
