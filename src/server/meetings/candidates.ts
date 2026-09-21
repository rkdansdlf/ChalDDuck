import "server-only";

import { computeMeetingSlots } from "@/features/schedule/meeting-slots";
import { db } from "@/server/db";

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
    select: {
      name: true,
      busyBlocks: { select: { day: true, startHour: true, hours: true, kind: true } },
    },
  });

  const slots = computeMeetingSlots(members);

  await db.$transaction([
    db.meetingSlot.deleteMany({ where: { teamId } }),
    db.meetingSlot.createMany({
      data: slots.map((s) => ({ ...s, teamId, weekKey: "this" })),
    }),
  ]);
}
