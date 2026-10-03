"use server";

import { revalidatePath } from "next/cache";
import { whenText } from "@/features/schedule/meeting-cell";
import { effectiveStage, isPastDeadline } from "@/features/schedule/meeting-model";
import { MIN_ATTENDEES, membersBlockedAt, slotAt } from "@/features/schedule/meeting-slots";
import { SCHEDULE_DAYS, SCHEDULE_HOURS } from "@/data/catalog";
import { addDays, candidateDates, isWeekKey, nowHourInSeoul, todayInSeoul } from "@/features/schedule/week";
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

/**
 * 끝난 결정의 `activeKey` 를 비운다.
 *
 * `activeKey` 는 **아직 응답을 기다리는 결정** 하나를 지키는-lock 이다. 확정된 회의는 이미
 * 끝난 사실이지 진행 중인 결정이 아니다. 그런데 예전에는 확정을 해도 키를 그대로 두었고,
 * 비우는 곳이 어디에도 없었다(`IceRound.activeKey` 와 달리). 그 결과 한 번 회의가 확정되면
 * 팀은 **영영 두 번째 회의를 잡을 수 없었다** — `assertCanPropose` 가 계속 "이미 확정된 회의가
 * 있습니다"를 던지고, 화면(`slots-screen`)도 제안을 띄울 칸을 열지 않았다. 후보는 매일 다시
 * 계산되는데 아무도 고를 수 없는 상태였다.
 *
 * 그래도 여기서 직접 비우지 않고 **계산된 상태**(`effectiveStage`)로 판단한다 — 마감은 아무도
 * 앱을 열지 않아도 지나가므로, 예약 작업이 표를 고치기 전에도 이 자리가 스스로 정결된다.
 * `meeting-model.ts` 를 한 곳에 둔 이유가 바로 이것이고, 이제 그 판단이 세 곳이 아니라
 * 여섯 곳이 함께 한다. 반대가 붙은 제안은 끝난 것이 아니므로 키를 붙든 채 둔다.
 */
async function releaseSettledDecision(teamId: string): Promise<void> {
  const held = await db.meetingProposal.findFirst({
    where: { teamId, activeKey: teamId },
    select: { id: true, stage: true, respondBy: true, responses: { select: { agree: true } } },
  });
  if (!held) return;

  // 이미 끝난 상태인데 키가 붙어 있는 행 — 지금 고치기 **전에** 확정돼 있던 회의가 그렇다.
  // 이쪽도 비운다. 안 그러면 그 팀은 이 수정 없이도, 평생 막힌 채 남는다.
  if (held.stage !== "proposed") {
    await db.meetingProposal.update({ where: { id: held.id }, data: { activeKey: null } });
    return;
  }

  const settled = effectiveStage({
    stage: "proposed",
    respondBy: held.respondBy,
    against: held.responses.filter((r) => !r.agree).length,
  });
  // "proposed" 면 아직 결정이 끝나지 않았다 — 키를 붙든 채 둔다. 반대가 붙은 제안도 같다.
  if (settled === "proposed") return;

  await db.meetingProposal.update({
    where: { id: held.id },
    data: { stage: settled, activeKey: null },
  });
}

/**
 * 지금 제안할 수 있는지 확인한다. **응답을 기다리는 결정**이 있으면 막는다.
 *
 * 끝난 결정(확정·이월)은 막지 않는다 — 그건 이미 정해진 사실이고, 다음 회의는 그 뒤에 별개로
 * 잡는 일이다. 예전에는 확정된 회의까지 "진행 중"으로 취급해 팀이 두 번째 회의를 잡지 못했다.
 */
async function assertCanPropose(teamId: string): Promise<void> {
  // 예약 작업이 아직 표를 고치지 않았어도 스스로 정결되게 한다 — 화면은 이미
  // `effectiveStage` 로 "확정"으로 보고 있는데 서버만 "대기 중"이라 하면, 사용자가 볼 말과
  // 눌렀을 때의 말이 어긋난다("확정이라는데 왜 막히지").
  await releaseSettledDecision(teamId);

  const decided = await db.meetingProposal.findFirst({
    where: { teamId, activeKey: teamId },
    select: { stage: true },
  });
  if (!decided) return;
  throw new Error(
    decided.stage === "confirmed" ? "이미 확정된 회의가 있습니다." : "이미 올라온 회의 제안이 있습니다.",
  );
}

export type ProposalDetails = {
  location?: string | null;
  agenda?: string | null;
  durationMinutes?: number;
};

/** 후보 하나를 팀에 제안한다. 제안자는 그 자리에서 동의한 것으로 본다. */
export async function proposeMeeting(slotId: string, details?: ProposalDetails): Promise<void> {
  const me = await requireSessionMember();

  // 화면이 보낸 후보가 정말 우리 팀 것인지 서버에서 확인한다.
  const slot = await db.meetingSlot.findFirst({ where: { id: slotId, teamId: me.teamId } });
  if (!slot) throw new Error("회의 시간 후보를 찾을 수 없습니다.");

  // 후보 행에는 요일만 있다. 날짜는 후보 기간(오늘부터 7일)에서 요일로 되짚는다 —
  // 7일 안에 각 요일은 딱 한 번이라 "수"가 어느 수요일인지 하나로 정해진다.
  // 시각은 `time`("13:00 – 14:00")에서 앞 숫자만 읽는다 — 이미 지나간 시간이면 거절한다.
  const startHour = Number.parseInt(slot.time, 10);
  await startProposal(
    me,
    slot,
    candidateDateOf(slot.day)?.date ?? null,
    Number.isNaN(startHour) ? undefined : startHour,
    details,
  );
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
export async function proposeMeetingAt(
  week: string,
  day: number,
  hour: number,
  details?: ProposalDetails,
): Promise<void> {
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

  // 후보 행을 만들기 **전에** 막는다 — 막히고 남은 후보 행은 어느 화면에서도 안 쓰인다.
  await assertCanPropose(me.teamId);

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

  // **인덱스를 시각으로 바꾸어 넘긴다.** `hour` 는 시간표의 칸 번호(0 = 9시)이고
  // `startProposal` 이 비교하는 것은 **시각**이다.
  const startHour = Number.parseInt(computed.time, 10);
  await startProposal(me, slot, date, Number.isNaN(startHour) ? undefined : startHour, details);
}

/**
 * 후보를 팀에 제안한다.
 *
 * **진행 중인 결정이 있으면 받지 않는다.** 올라온 제안(마감까지 반대를 기다리는)이거나
 * 이미 확정된 회의면 그 위에서 다시 제안할 수 없다 — 뒤엎으면 "확정"이라는 말이
 * 아무 뜻이 없어진다. 이월(`carried`)은 결정을 미룬 것이라 대신할 수 있다.
 *
 * 방어선은 DB 다. `MeetingProposal.activeKey` 유일 인덱스가 진행 중인 결정 하나를 지킨다
 * (`IceRound.activeKey` 와 같은 방식).
 */
async function startProposal(
  me: { id: string; name: string; teamId: string },
  slot: { id: string; day: string; time: string },
  date: string | null,
  /**
   * 제안 시간의 **실제 시각** (0–23). 칸 번호가 아니다.
   */
  startHour?: number,
  details?: ProposalDetails,
): Promise<void> {
  const respondBy = new Date(Date.now() + RESPOND_WINDOW_HOURS * 60 * 60 * 1000);

  const location = details?.location?.trim() ? details.location.trim().slice(0, 100) : null;
  const agenda = details?.agenda?.trim() ? details.agenda.trim().slice(0, 200) : null;
  const durationMinutes =
    details?.durationMinutes && [30, 60, 90, 120].includes(details.durationMinutes)
      ? details.durationMinutes
      : 60;

  await assertCanPropose(me.teamId);

  if (date === todayInSeoul() && startHour !== undefined && startHour < nowHourInSeoul()) {
    throw new Error("이미 지나간 시간입니다. 다른 시간을 골라 주세요.");
  }

  try {
    await db.$transaction(async (tx) => {
      // 지난번에 이월해 둔 보류 행은 치운다.
      await tx.meetingProposal.deleteMany({ where: { teamId: me.teamId, stage: "carried" } });

      const proposal = await tx.meetingProposal.create({
        data: {
          teamId: me.teamId,
          slotId: slot.id,
          proposedById: me.id,
          date,
          respondBy,
          activeKey: me.teamId,
          location,
          agenda,
          durationMinutes,
        },
      });
      await tx.meetingResponse.create({
        data: { proposalId: proposal.id, memberId: me.id, agree: true },
      });
    });
  } catch (error) {
    // 확인한 뒤 누군가 먼저 올린 경우 — 먼저 들어간 결정을 따른다.
    if ((error as { code?: string }).code === "P2002") {
      throw new Error("누군가 먼저 회의 시간을 제안했습니다.");
    }
    throw error;
  }

  await notify({
    to: await teamMemberIds(me.teamId),
    kind: "meeting",
    title: `${me.name}님이 회의 시간을 제안했습니다`,
    body: `${whenText(date, slot.day, slot.time)} · 마감까지 반대가 없으면 확정됩니다`,
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
    await db.$transaction([
      db.meetingProposal.delete({ where: { id: proposal.id } }),
      // **후보를 낡은 채로 두지 않는다.** 제안이 올라가 있는 동안에는 시간표가 바뀌어도
      // 후보를 다시 만들지 않는다(고르던 후보가 발밑에서 사라지면 무엇에 동의했는지
      // 없어진다). 그래서 제안이 철회되면, 그 사이 바뀐 시간표가 반영되지 않은 후보가
      // 그대로 남았다 — 팀이 "모두 못 오는 시간"을 다시 제안하게 된다.
      //
      // **즉시 다시 만들지는 않는다.** 다시 만들면 후보 행의 id 가 전부 바뀌어, 그 사이 고른
      // 것이 "후보를 찾을 수 없습니다"가 된다. 대신 "마지막으로 만든 날"만 비워 두면 다음에
      // 09 화면을 열 때 `refreshStaleCandidates` 가 자동으로 다시 만든다.
      db.team.update({ where: { id: me.teamId }, data: { candidatesFrom: null } }),
    ]);
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

  // 화면에는 진행 중인 결정이 없을 때 이 버튼만 보이지만, 서버 액션은 POST 로 바로
  // 불릴 수 있다. 올라온 제안이나 확정된 회의를 이월로 지우면 팀원이 동의한 것이 사라진다.
  await assertCanPropose(me.teamId);

  await db.$transaction(async (tx) => {
    // 이월은 보류다. 예전 이월만 치운다 — 진행 중인 결정은 위에서 이미 막았다.
    await tx.meetingProposal.deleteMany({ where: { teamId: me.teamId, stage: "carried" } });
    await tx.meetingProposal.create({
      data: {
        teamId: me.teamId,
        proposedById: me.id,
        stage: "carried",
        respondBy: new Date(),
      },
    });
  });

  // 이월은 팀 전체가 알아야 하는 결정이다 — 조용히 바뀌면 아무도 모른다.
  await notify({
    to: await teamMemberIds(me.teamId),
    kind: "meeting",
    title: `${me.name}님이 이번 주 회의를 다음 주로 넘겼습니다`,
    body: "이번 주는 열리지 않습니다. 다음 주 시간은 다시 골라 주세요",
    href: "/schedule/slots",
    actorId: me.id,
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
}
