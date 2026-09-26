import "server-only";

import { SCHEDULE_DAYS } from "@/data/catalog";
import { computeMeetingSlots } from "@/features/schedule/meeting-slots";
import {
  candidateDates,
  scheduleWeeks,
  todayInSeoul,
  type CandidateDate,
} from "@/features/schedule/week";
import { db } from "@/server/db";

/**
 * 아직 지나가지 않은 안 되는 시간 — 매주 반복하는 것과, 오늘이 속한 주 이후의 "그 주에만".
 *
 * 회의 후보·제안·"못 오는 사람" 계산이 모두 이 조건으로 읽는다. 날마다 어느 주의 블록을
 * 쓸지는 계산(`meeting-slots.ts`)이 `weekOf` 를 보고 고른다.
 */
export function liveBusy() {
  return { OR: [{ weekOf: null }, { weekOf: { gte: scheduleWeeks()[0] } }] };
}

/** 계산에 쓰는 안 되는 시간의 모양. */
export const BUSY_FOR_SLOTS = {
  where: liveBusy(),
  select: { day: true, startHour: true, hours: true, kind: true, weekOf: true },
} as const;

/** 후보 기간 안에서 그 요일("수")이 가리키는 날. 기간이 7일이라 하나로 정해진다. */
export function candidateDateOf(dayLetter: string): CandidateDate | null {
  return candidateDates().find((d) => SCHEDULE_DAYS[d.day] === dayLetter) ?? null;
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

  const members = await db.member.findMany({
    where: { teamId, leftAt: null },
    select: { name: true, busyBlocks: BUSY_FOR_SLOTS },
  });

  const from = todayInSeoul();
  const slots = computeMeetingSlots(members, candidateDates());

  await db.$transaction([
    db.meetingSlot.deleteMany({ where: { teamId } }),
    db.meetingSlot.createMany({
      data: slots.map((s) => ({ ...s, teamId, weekKey: "this" })),
    }),
    db.team.update({ where: { id: teamId }, data: { candidatesFrom: from } }),
  ]);
}

/**
 * 후보를 만든 날이 지났으면 다시 만든다.
 *
 * 후보는 시간표를 저장할 때 만들어지는데, **날이 바뀌는 건 아무도 저장하지 않아도 온다.**
 * 그대로 두면 어제가 후보에 남고, 지난주에만 있던 시험 기간이 이번 주 후보까지 막는다.
 * 그래서 후보를 보여 주기 직전에 확인한다(09 화면). 올라온 제안이 있으면
 * `rebuildMeetingCandidates` 가 건너뛴다.
 *
 * 하루에 한 번만 다시 만든다 — 다시 만들면 후보 행의 id 가 바뀌어, 고르고 있던 후보로
 * 제안하는 순간 "후보를 찾을 수 없습니다"가 난다. 시간 단위로 만들면 그 일이 잦아진다.
 */
export async function refreshStaleCandidates(teamId: string): Promise<void> {
  const team = await db.team.findUnique({ where: { id: teamId }, select: { candidatesFrom: true } });
  if (team && team.candidatesFrom !== todayInSeoul()) await rebuildMeetingCandidates(teamId);
}
