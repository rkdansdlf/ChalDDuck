import "./load-env.mjs";
import { db, check, truthy, finish } from "./db-test-base.mjs";

async function run() {
  console.log("=== MeetingNote DB & Server Action 테스트 ===");

  // 1. 임의 팀 또는 기존 팀 조회
  let team = await db.team.findFirst();
  if (!team) {
    team = await db.team.create({
      data: {
        id: "test-note-team",
        name: "노트 테스트팀",
        course: "소프트웨어공학",
        code: "NOTE12",
      },
    });
  }

  // 2. 테스트용 회의 제안 생성
  const meeting = await db.meetingProposal.create({
    data: {
      teamId: team.id,
      proposedById: (await db.member.findFirst({ where: { teamId: team.id } }))?.id ??
        (await db.member.create({
          data: {
            teamId: team.id,
            name: "테스트멤버",
          },
        })).id,
      date: "2026-10-10",
      location: "학생회관 2층",
      agenda: "중간발표 준비 회의",
      durationMinutes: 60,
      stage: "confirmed",
      respondBy: new Date(Date.now() + 3600000),
    },
  });

  truthy("회의 제안 생성 완료", Boolean(meeting.id));

  // 3. MeetingNote 직접 생성 및 1:1 관계 확인
  const note = await db.meetingNote.create({
    data: {
      teamId: team.id,
      meetingId: meeting.id,
      title: "중간발표 준비 회의록",
      rawText: "팀원들과 발표 순서 및 자료 제작 일정을 논의함.",
      summary: "### 회의 요약\n- 발표 순서: 서론(김철수), 본론(이영희)\n- 자료 마감: 10/14",
      taskCount: 2,
    },
    include: {
      meeting: true,
    },
  });

  check("MeetingNote 생성 및 외래키 연결 확인", note.meetingId, meeting.id);
  check("MeetingNote 역참조 확인", note.meeting?.agenda, "중간발표 준비 회의");

  // 4. MeetingProposal에서 note include 조회 확인
  const retrievedProposal = await db.meetingProposal.findUnique({
    where: { id: meeting.id },
    include: { note: true },
  });

  check("MeetingProposal.note 관계 조회 성공", retrievedProposal?.note?.id, note.id);
  truthy("hasNote 판별 참", Boolean(retrievedProposal?.note));

  // 5. 회의록 업데이트 (upsert 동작 검증)
  const updatedNote = await db.meetingNote.upsert({
    where: { meetingId: meeting.id },
    create: {
      teamId: team.id,
      meetingId: meeting.id,
      title: "새 회의록",
      rawText: "원문",
      summary: "요약",
    },
    update: {
      summary: "### 수정된 회의 요약\n- 추가 안건 확정",
      taskCount: 3,
    },
  });

  check("MeetingNote upsert 업데이트 확인", updatedNote.taskCount, 3);

  // 6. 정리 (테스트 데이터 롤백)
  await db.meetingNote.delete({ where: { id: note.id } });
  await db.meetingProposal.delete({ where: { id: meeting.id } });

  await finish();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
