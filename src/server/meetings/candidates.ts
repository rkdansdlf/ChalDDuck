import "server-only";

import { computeMeetingSlots } from "@/features/schedule/meeting-slots";
import { scheduleWeeks, type WeekKey } from "@/features/schedule/week";
import { db } from "@/server/db";

/**
 * 한 주에 걸리는 안 되는 시간 — 매주 반복하는 것과 그 주에만 있는 것.
 *
 * 회의 후보·제안·"못 오는 사람" 계산이 모두 이 조건으로 읽어야 같은 사람을 같은 시간에
 * "안 됨"으로 센다.
 */
export function busyInWeek(week: WeekKey) {
  return { OR: [{ weekOf: null }, { weekOf: week }] };
}

/** 회의 후보를 계산하는 주 — 볼 수 있는 주 가운데 첫 주. */
export function candidateWeek(): WeekKey {
  return scheduleWeeks()[0];
}

/**
 * 회의 시간 후보를 팀원들의 시간표에서 다시 만든다.
 *
 * 지금까지 `MeetingSlot` 행은 시드만 넣었다 — 그래서 새로 만든 팀은 시간표를 아무리 내도
 * 후보가 영원히 비어 있었다(실제로 그랬다). 후보는 저장해 둔 값이 아니라 **시간표에서 나오는
 * 계산 결과**이므로, 시간표나 명단이 바뀔 때마다 여기서 다시 만든다.
 *
 * 그래도 표에 남기는 이유는 회의 제안이 후보 행을 가리키기 때문이다(`MeetingProposal.slotId`).
 * 그래서 **제안이 올라와 있는 동안에는 다시 만들지 않는다** — 제안된 후보가 발밑에서
 * 사라지면 팀원이 무엇에 동의하는지가 없어진다.
 *
 * 계산 자체는 `features/schedule/meeting-slots.ts` 에 있다. 시드도 같은 함수를 쓴다.
 */
export async function rebuildMeetingCandidates(teamId: string): Promise<void> {
  const live = await db.meetingProposal.findFirst({
    where: { teamId, stage: "proposed" },
    select: { id: true },
  });
  if (live) return;

  const week = candidateWeek();
  const members = await db.member.findMany({
    where: { teamId, leftAt: null },
    select: {
      name: true,
      busyBlocks: {
        where: busyInWeek(week),
        select: { day: true, startHour: true, hours: true, kind: true },
      },
    },
  });

  const slots = computeMeetingSlots(members);

  await db.$transaction([
    db.meetingSlot.deleteMany({ where: { teamId } }),
    db.meetingSlot.createMany({
      data: slots.map((s) => ({ ...s, teamId, weekKey: "this" })),
    }),
    db.team.update({ where: { id: teamId }, data: { candidatesWeek: week } }),
  ]);
}

/**
 * 후보를 만든 주가 지나갔으면 다시 만든다.
 *
 * 후보는 시간표를 저장할 때 만들어지는데, **주가 바뀌는 건 아무도 저장하지 않아도 온다.**
 * 그대로 두면 지난주에만 있던 시험 기간이 이번 주 후보까지 막는다. 그래서 후보를 보여 주기
 * 직전에 확인한다(09 화면). 올라온 제안이 있으면 `rebuildMeetingCandidates` 가 건너뛴다.
 */
export async function refreshStaleCandidates(teamId: string): Promise<void> {
  const team = await db.team.findUnique({ where: { id: teamId }, select: { candidatesWeek: true } });
  if (team && team.candidatesWeek !== candidateWeek()) await rebuildMeetingCandidates(teamId);
}
