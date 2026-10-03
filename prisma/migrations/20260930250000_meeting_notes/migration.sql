-- 회의록 아카이브 (MeetingNote) 모델 추가
-- 확정 회의 또는 자유 회의의 AI 서기 요약본 및 원문 기록을 영구 보관한다.

CREATE TABLE "MeetingNote" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "meetingId" TEXT,
    "title" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingNote_pkey" PRIMARY KEY ("id")
);

-- 유니크 인덱스: 회의 제안 하나당 최대 1개의 회의록 매핑
CREATE UNIQUE INDEX "MeetingNote_meetingId_key" ON "MeetingNote"("meetingId");

-- 팀 및 회의 검색 인덱스
CREATE INDEX "MeetingNote_teamId_idx" ON "MeetingNote"("teamId");
CREATE INDEX "MeetingNote_meetingId_idx" ON "MeetingNote"("meetingId");

-- 외래 키 제약 조건
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingNote" ADD CONSTRAINT "MeetingNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
