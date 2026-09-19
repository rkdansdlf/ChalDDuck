"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 09 / 10 회의 시간 서버 액션.
 *
 * 확정 규칙: **특정 한 사람이 단독으로 확정하지 않는다.** 제안한 사람은 그 자리에서
 * 동의한 것으로 보고, 응답 마감까지 반대가 없어야 확정된다.
 */

/** 응답 마감까지의 시간. 24시간이 적당한지는 아직 확정되지 않은 정책이다. */
const RESPOND_WINDOW_HOURS = 24;

/** 팀의 가장 최근 제안. 한 번에 하나만 다룬다. */
async function currentProposal(teamId: string) {
  return db.meetingProposal.findFirst({ where: { teamId }, orderBy: { createdAt: "desc" } });
}

/** 후보 하나를 팀에 제안한다. 제안자는 그 자리에서 동의한 것으로 본다. */
export async function proposeMeeting(slotId: string): Promise<void> {
  const me = await requireSessionMember();

  // 화면이 보낸 후보가 정말 우리 팀 것인지 서버에서 확인한다.
  const slot = await db.meetingSlot.findFirst({ where: { id: slotId, teamId: me.teamId } });
  if (!slot) throw new Error("회의 시간 후보를 찾을 수 없습니다.");

  const respondBy = new Date(Date.now() + RESPOND_WINDOW_HOURS * 60 * 60 * 1000);

  await db.$transaction(async (tx) => {
    // 앞선 제안은 정리하고 새로 시작한다 — 동시에 두 개가 올라와 있으면 무엇을 따를지 알 수 없다.
    await tx.meetingProposal.deleteMany({ where: { teamId: me.teamId } });

    const proposal = await tx.meetingProposal.create({
      data: { teamId: me.teamId, slotId: slot.id, proposedById: me.id, respondBy },
    });
    await tx.meetingResponse.create({
      data: { proposalId: proposal.id, memberId: me.id, agree: true },
    });
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
}

/**
 * 제안에 응답한다.
 *
 * 반대가 하나라도 있으면 확정되지 않는다 — 제안을 지우고 후보를 다시 고르는 상태로 돌린다.
 */
export async function respondToMeeting(agree: boolean): Promise<void> {
  const me = await requireSessionMember();

  const proposal = await currentProposal(me.teamId);
  if (!proposal || proposal.stage !== "proposed") return;

  if (!agree) {
    await db.meetingProposal.delete({ where: { id: proposal.id } });
  } else {
    await db.meetingResponse.upsert({
      where: { proposalId_memberId: { proposalId: proposal.id, memberId: me.id } },
      update: { agree: true },
      create: { proposalId: proposal.id, memberId: me.id, agree: true },
    });
  }

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
}

/**
 * 응답 마감이 지난 것으로 보고 확정한다.
 *
 * ⚠️ 원래는 마감 시각이 되면 서버가 알아서 하는 일이다(예약 작업). 지금은 그 장치가 없어
 * 화면의 "응답 마감 시뮬레이션" 버튼이 부른다 — 그래서 화면에도 데모라고 적혀 있다.
 * 반대가 하나라도 있으면 확정하지 않는 규칙은 여기서도 지킨다.
 *
 * 결과를 돌려주는 이유: 반대가 있어 확정하지 않은 것과 확정한 것이 화면에서 구별되지 않으면
 * 버튼이 고장 난 것처럼 보인다. 화면은 이 값으로 무엇이 일어났는지 알린다.
 */
export async function confirmMeetingByDeadline(): Promise<"confirmed" | "blocked" | "gone"> {
  const me = await requireSessionMember();

  const proposal = await currentProposal(me.teamId);
  if (!proposal || proposal.stage !== "proposed") return "gone";

  const objections = await db.meetingResponse.count({
    where: { proposalId: proposal.id, agree: false },
  });
  if (objections > 0) return "blocked";

  await db.meetingProposal.update({ where: { id: proposal.id }, data: { stage: "confirmed" } });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
  return "confirmed";
}

/** 전원 불가한 주를 건너뛰고 다음 주로 넘긴다. */
export async function carryOverMeeting(): Promise<void> {
  const me = await requireSessionMember();

  await db.$transaction(async (tx) => {
    await tx.meetingProposal.deleteMany({ where: { teamId: me.teamId } });
    await tx.meetingProposal.create({
      data: {
        teamId: me.teamId,
        proposedById: me.id,
        stage: "carried",
        respondBy: new Date(),
      },
    });
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
}
