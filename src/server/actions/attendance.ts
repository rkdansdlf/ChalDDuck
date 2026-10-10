"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireLeader, requireSessionMember } from "@/server/session";
import {
  recordMeetingAttendanceContrib,
  unrecordMeetingAttendanceContrib,
} from "@/server/contrib/auto-record";

export type MeetingAttendanceInfo = {
  meetingId: string;
  isLeader: boolean;
  canEdit: boolean;
  attendees: {
    memberId: string;
    name: string;
    attended: boolean;
    agreed: boolean;
    checkedAt: string | null;
  }[];
};

/**
 * 특정 회의의 출석 현황을 조회한다.
 *
 * 팀원 목록과 함께 각 인원의 출석 여부, 제안 당시 동의 여부를 반환한다.
 */
export async function getMeetingAttendance(meetingId: string): Promise<MeetingAttendanceInfo> {
  const me = await requireSessionMember();

  const meeting = await db.meetingProposal.findFirst({
    where: { id: meetingId, teamId: me.teamId },
    include: {
      responses: { select: { memberId: true, agree: true } },
      attendances: { select: { id: true, memberId: true, createdAt: true } },
    },
  });

  if (!meeting) {
    throw new Error("회의를 찾을 수 없습니다.");
  }

  const members = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: { id: true, name: true },
    orderBy: { joinedAt: "asc" },
  });

  const responseMap = new Map(meeting.responses.map((r) => [r.memberId, r.agree]));
  const attendanceMap = new Map(meeting.attendances.map((a) => [a.memberId, a.createdAt]));

  return {
    meetingId,
    isLeader: me.isLeader,
    canEdit: me.isLeader && meeting.stage === "confirmed",
    attendees: members.map((m) => {
      const checkedAt = attendanceMap.get(m.id);
      return {
        memberId: m.id,
        name: m.name,
        attended: checkedAt !== undefined,
        agreed: responseMap.get(m.id) === true,
        checkedAt: checkedAt ? checkedAt.toISOString() : null,
      };
    }),
  };
}

/**
 * 회의 출석 명단을 저장한다 (팀장 전용).
 *
 * - 체크된 인원은 `MeetingAttendance` 생성 및 `ContribRecord` 자동 수집.
 * - 체크 해제된 인원은 `MeetingAttendance` 삭제 및 대기 중인 기여 기록 회수.
 */
export async function saveMeetingAttendance(
  meetingId: string,
  attendeeMemberIds: string[],
): Promise<{ success: boolean; count: number }> {
  const me = await requireLeader();

  const meeting = await db.meetingProposal.findFirst({
    where: { id: meetingId, teamId: me.teamId },
    include: { slot: true },
  });

  if (!meeting) {
    throw new Error("회의를 찾을 수 없습니다.");
  }

  if (meeting.stage !== "confirmed") {
    throw new Error("확정된 회의에만 출석을 기록할 수 있습니다.");
  }

  const title = `[회의 참석] ${meeting.agenda ? meeting.agenda : "정기 회의"}`;
  const date = meeting.date;

  // 팀에 속한 유효한 팀원 id인지 확인
  const teamMembers = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: { id: true },
  });
  const validMemberIds = new Set(teamMembers.map((m) => m.id));
  const sanitizedAttendeeIds = attendeeMemberIds.filter((id) => validMemberIds.has(id));

  await db.$transaction(async (tx) => {
    // **회의 행을 잠그고 한 명씩 지나가게 한다** — 드라이브(`withBoxLock`)와 같은 관용구다.
    // 저장 버튼을 빠르게 두 번 누르면 두 요청이 모두 "아직 출석이 없다"를 읽고 둘 다 만들려 한다.
    // 유일 제약이 중복은 막지만 그 순간 한쪽이 Prisma 의 원문 오류(`Unique constraint failed`)를
    // 사용자에게 던진다. 잠그면 뒤의 요청이 앞 요청의 결과를 읽고 할 일이 없는 걸 안다.
    // (이 하네스의 "던졌다면 DB 오류 원문이 아니다" 가 약 절반씩 실패해서 드러났다.)
    await tx.$queryRaw`SELECT 1 FROM "MeetingProposal" WHERE "id" = ${meetingId} FOR UPDATE`;

    const existing = await tx.meetingAttendance.findMany({
      where: { meetingId },
      select: { id: true, memberId: true },
    });

    // 1. 체크 해제된 인원: 기여 회수 및 출석 삭제
    const toRemove = existing.filter((e) => !sanitizedAttendeeIds.includes(e.memberId));
    for (const r of toRemove) {
      await unrecordMeetingAttendanceContrib(tx, meetingId, r.memberId);
      await tx.meetingAttendance.delete({ where: { id: r.id } });
    }

    // 2. 새로 추가된 인원: 출석 생성 및 기여 기록
    const existingMemberIds = new Set(existing.map((e) => e.memberId));
    const toAdd = sanitizedAttendeeIds.filter((id) => !existingMemberIds.has(id));

    for (const memberId of toAdd) {
      await tx.meetingAttendance.create({
        data: {
          meetingId,
          memberId,
          checkedById: me.id,
        },
      });

      await recordMeetingAttendanceContrib(tx, {
        meetingId,
        memberId,
        meetingTitle: title,
        date,
      });
    }
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/team/contrib", "layout");
  revalidatePath("/home", "layout");

  return { success: true, count: sanitizedAttendeeIds.length };
}
