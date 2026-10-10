"use server";

import { revalidatePath } from "next/cache";
import { effectiveStage } from "@/features/schedule/meeting-model";
import { meetingFlowText, planMeetingFlow } from "@/lib/saju/meeting-flow";
import { db } from "@/server/db";
import { getSessionMember } from "@/server/session";
import type { MeetingProposal } from "@/lib/types";

/**
 * 회의에 진행 방식 저장·지우기 — 회의 케미 시트가 "회의에 저장하기"로 부른다.
 *
 * ## 글은 서버가 만든다
 *
 * 클라이언트가 보낸 글을 저장하지 않는다. 받는 것은 회의 번호 하나뿐이고, 글은 그 회의의 길이로
 * `planMeetingFlow` 가 만든다. 팀원 모두가 보는 칸에 임의의 글을 넣는 길이 없다.
 *
 * ## 사주 데이터가 들어가지 않는다
 *
 * 저장하는 글에는 오행에서 고른 제안("가장 적게 센 오행 …")을 **넣지 않는다**(`meetingFlowText(plan, [])`).
 * 저장한 글은 사주를 등록하지 않은 팀원도 보므로, 거기 팀 오행의 단서가 있으면 "내가 등록해야 남의 값도
 * 본다"는 규칙이 이 칸으로 새어 나간다. 그래서 누구나(등록 여부와 무관하게) 저장·지울 수 있다.
 *
 * ## 확정된 회의만
 *
 * 저장은 확정된 회의에만 한다 — 아직 응답을 기다리는 제안은 확정되지 않을 수 있다. 확정 여부는 화면이
 * 보는 것과 같은 계산(`effectiveStage`)으로 본다: 마감은 아무도 앱을 열지 않아도 지나간다.
 * 지우기는 단계와 무관하다(팀의 회의라면 언제든 지울 수 있다).
 *
 * 실패는 던지지 않고 돌려준다 — 운영 빌드는 던진 오류의 문구를 지운다.
 */
export type MeetingFlowResult = "ok" | "invalid" | "gone" | "not-confirmed";

async function findTeamMeeting(meetingId: unknown, teamId: string) {
  if (typeof meetingId !== "string" || meetingId.length === 0 || meetingId.length > 64) return null;
  return db.meetingProposal.findFirst({
    where: { id: meetingId, teamId },
    select: {
      id: true,
      stage: true,
      respondBy: true,
      durationMinutes: true,
      responses: { select: { agree: true } },
    },
  });
}

export async function saveMeetingFlow(meetingId: string): Promise<MeetingFlowResult> {
  const session = await getSessionMember();
  if (!session) return "invalid";

  const meeting = await findTeamMeeting(meetingId, session.teamId);
  if (!meeting) return "gone";

  const stage = effectiveStage({
    stage: meeting.stage as MeetingProposal["stage"],
    respondBy: meeting.respondBy,
    against: meeting.responses.filter((r) => !r.agree).length,
  });
  if (stage !== "confirmed") return "not-confirmed";

  await db.meetingProposal.update({
    where: { id: meeting.id },
    data: { flow: meetingFlowText(planMeetingFlow(meeting.durationMinutes), []) },
  });

  revalidatePath("/schedule/slots");
  return "ok";
}

export async function clearMeetingFlow(meetingId: string): Promise<MeetingFlowResult> {
  const session = await getSessionMember();
  if (!session) return "invalid";

  const meeting = await findTeamMeeting(meetingId, session.teamId);
  if (!meeting) return "gone";

  await db.meetingProposal.update({ where: { id: meeting.id }, data: { flow: null } });

  revalidatePath("/schedule/slots");
  return "ok";
}
