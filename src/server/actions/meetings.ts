"use server";

import { revalidatePath } from "next/cache";
import { isPastDeadline } from "@/features/schedule/meeting-model";
import { MIN_ATTENDEES, membersBlockedAt, slotAt } from "@/features/schedule/meeting-slots";
import { SCHEDULE_DAYS, SCHEDULE_HOURS } from "@/data/catalog";
import { addDays, candidateDates, isWeekKey } from "@/features/schedule/week";
import { db } from "@/server/db";
import { BUSY_FOR_SLOTS, candidateDateOf } from "@/server/meetings/candidates";
import { notify, teamMemberIds } from "@/server/notify/create";
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

  await startProposal(me, slot);
}

/**
 * 팀 겹쳐보기에서 고른 칸 하나를 제안한다.
 *
 * 추천 후보 다섯 개 밖의 시간도 팀이 고를 수 있어야 한다. 제안은 후보 행을 가리키므로
 * 그 칸을 후보로 만든 뒤 `proposeMeeting` 과 같은 길로 보낸다. 몇 명이 되는지는 화면이
 * 보낸 값이 아니라 **서버가 시간표에서 다시 센다.**
 *
 * 09 화면과 같이 **올라온 제안이 없을 때만** 받는다 — 확정된 회의를 칸 하나 눌러
 * 덮어쓸 수 있으면 확정이라는 말이 무의미해진다.
 *
 * 후보와 같이 **오늘부터 7일 안의 날**만 받는다. 제안은 요일("수")로만 남기 때문에,
 * 7일을 넘으면 어느 수요일인지 알 수 없다.
 */
export async function proposeMeetingAt(week: string, day: number, hour: number): Promise<void> {
  const me = await requireSessionMember();

  if (
    !isWeekKey(week) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    day < 0 ||
    day >= SCHEDULE_DAYS.length ||
    hour < 0 ||
    hour >= SCHEDULE_HOURS.length
  ) {
    throw new Error("시간표 밖의 시간입니다.");
  }
  const date = addDays(week, day);
  if (!candidateDates().some((d) => d.date === date)) {
    throw new Error("오늘부터 7일 안의 시간만 제안할 수 있습니다.");
  }

  if (await currentProposal(me.teamId)) throw new Error("이미 올라온 회의 제안이 있습니다.");

  const members = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: {
      name: true,
      busyBlocks: BUSY_FOR_SLOTS,
    },
  });
  const computed = slotAt(members, week, day, hour);
  if (computed.available < MIN_ATTENDEES) throw new Error("이 시간에는 두 명 이상 모일 수 없습니다.");

  // 추천 후보에 이미 있는 칸이면 그 행을 쓴다 — 같은 시간이 목록에 두 번 보이지 않게.
  const existing = await db.meetingSlot.findFirst({
    where: { teamId: me.teamId, weekKey: "this", day: computed.day, time: computed.time },
  });
  const slot =
    existing ??
    (await db.meetingSlot.create({ data: { ...computed, teamId: me.teamId, weekKey: "this" } }));

  await startProposal(me, slot);
}

async function startProposal(
  me: { id: string; name: string; teamId: string },
  slot: { id: string; day: string; time: string },
): Promise<void> {
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

  await notify({
    to: await teamMemberIds(me.teamId),
    kind: "meeting",
    title: `${me.name}님이 회의 시간을 제안했습니다`,
    body: `${slot.day} ${slot.time} · 마감까지 반대가 없으면 확정됩니다`,
    href: "/schedule/slots",
    actorId: me.id,
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
}

/**
 * 10 전원 불가한 주 — 고른 후보에 못 오는 팀원에게 회의 전에 의견을 남겨 달라고 알린다.
 *
 * 받는 사람은 화면이 보낸 목록이 아니라 **서버가 시간표에서 다시 센다.** 돌려주는 값은
 * 실제로 알림이 간 사람 수 — 화면은 이 숫자로만 "보냈다"고 말한다.
 */
export async function requestRemoteInput(slotId: string): Promise<number> {
  const me = await requireSessionMember();

  const slot = await db.meetingSlot.findFirst({ where: { id: slotId, teamId: me.teamId } });
  if (!slot) throw new Error("회의 시간 후보를 찾을 수 없습니다.");

  const members = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: {
      id: true,
      name: true,
      busyBlocks: BUSY_FOR_SLOTS,
    },
  });
  // 후보의 요일이 가리키는 날(오늘부터 7일 안)의 주로 센다.
  const target = candidateDateOf(slot.day);
  if (!target) return 0;
  // 나도 빠지는 시간일 수 있지만, 나에게 부탁하는 알림은 보내지 않는다.
  const missing = membersBlockedAt(members, slot.day, slot.time, target.week)
    .map((m) => m.id)
    .filter((id) => id !== me.id);

  await notify({
    to: missing,
    kind: "meeting",
    title: `${me.name}님이 회의 전 의견을 부탁했습니다`,
    body: `${slot.day} ${slot.time} 회의에 오기 어렵다면 팀 채팅에 의견을 남겨 주세요`,
    href: "/chat/team",
    actorId: me.id,
  });

  return missing.length;
}

/**
 * 제안에 응답한다.
 *
 * 반대가 하나라도 있으면 확정되지 않는다 — 제안을 지우고 후보를 다시 고르는 상태로 돌린다.
 */
export async function respondToMeeting(agree: boolean): Promise<"ok" | "closed"> {
  const me = await requireSessionMember();

  const proposal = await currentProposal(me.teamId);
  if (!proposal || proposal.stage !== "proposed") return "closed";

  // 마감이 지난 뒤의 반대는 받지 않는다. 받아 주면 이미 확정된 회의가 뒤집혀,
  // "마감까지 반대가 없으면 확정"이라는 말이 아무 뜻도 없게 된다.
  if (isPastDeadline(proposal.respondBy)) return "closed";

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
  return "ok";
}

/**
 * 데모 — 응답 마감을 지금으로 당긴다.
 *
 * 24시간을 기다리지 않고 마감 뒤의 화면을 보기 위한 것이다. **확정하지는 않는다** —
 * 시계만 앞으로 돌리고, 확정 여부는 평소와 똑같이 규칙이 정한다(반대가 있으면 그대로
 * 대기). 그래서 이 버튼으로 본 화면이 실제 마감 뒤의 화면과 같다.
 *
 * 개발 환경에서만 동작한다.
 */
export async function fastForwardMeetingDeadline(): Promise<"moved" | "gone"> {
  if (process.env.NODE_ENV === "production") throw new Error("데모 기능입니다.");

  const me = await requireSessionMember();
  const proposal = await currentProposal(me.teamId);
  if (!proposal || proposal.stage !== "proposed") return "gone";

  await db.meetingProposal.update({
    where: { id: proposal.id },
    data: { respondBy: new Date() },
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
  return "moved";
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
