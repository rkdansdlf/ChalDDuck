"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { rebuildMeetingCandidates } from "@/server/meetings/candidates";
import { askedTodayBy, SCHEDULE_ASK_KIND } from "@/server/meetings/schedule-ask";
import { notify } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";
import { BUSY_KINDS, SCHEDULE_DAYS, SCHEDULE_HOURS } from "@/data/catalog";
import { normalizeBusyLabel } from "@/features/schedule/busy-blocks";
import type { BusyBlock } from "@/lib/types";

const PRESET_KINDS = new Set<string>(BUSY_KINDS.map((k) => k.key));

/**
 * 화면이 보낸 블록 하나를 저장할 행으로. 시간표 밖이거나 사유가 이상하면 거절한다 —
 * 서버 액션은 화면을 거치지 않고 바로 불릴 수 있다.
 */
function toRow(b: BusyBlock) {
  const inGrid =
    Number.isInteger(b.day) &&
    Number.isInteger(b.startHour) &&
    Number.isInteger(b.hours) &&
    b.day >= 0 &&
    b.day < SCHEDULE_DAYS.length &&
    b.startHour >= 0 &&
    b.hours >= 1 &&
    b.startHour + b.hours <= SCHEDULE_HOURS.length;
  if (!inGrid) throw new Error("시간표 밖의 시간이 있습니다.");

  if (b.kind === "custom") {
    const label = normalizeBusyLabel(b.label ?? "");
    if (!label) throw new Error("직접 입력한 사유의 이름을 확인해 주세요.");
    return { day: b.day, startHour: b.startHour, hours: b.hours, kind: "custom", label };
  }
  if (!PRESET_KINDS.has(b.kind)) throw new Error("알 수 없는 사유입니다.");
  // 기본 사유에는 이름이 붙지 않는다 — 화면이 보낸 값이 있어도 버린다.
  return { day: b.day, startHour: b.startHour, hours: b.hours, kind: b.kind, label: null };
}

/**
 * 08 내 시간표 저장.
 *
 * 내 시간표는 나만 고칠 수 있다 — 세션의 회원 것만 지우고 다시 넣는다.
 * 화면이 보내는 `memberId` 를 믿지 않는 이유는, 서버 액션이 화면을 거치지 않고
 * 바로 불릴 수 있기 때문이다.
 */
export async function saveMyBusyBlocks(blocks: BusyBlock[]): Promise<void> {
  const me = await requireSessionMember();
  const rows = blocks.map(toRow);

  await db.$transaction([
    db.busyBlock.deleteMany({ where: { memberId: me.id } }),
    db.busyBlock.createMany({ data: rows.map((r) => ({ ...r, memberId: me.id })) }),
  ]);

  // 후보는 저장된 값이 아니라 시간표에서 나오는 계산 결과다 — 시간표가 바뀌면 다시 만든다.
  await rebuildMeetingCandidates(me.teamId);

  revalidatePath("/schedule", "layout");
}

/**
 * 팀 겹쳐보기 — 아직 시간표를 안 낸 팀원에게 부탁한다.
 *
 * 보낸 사람을 밝히고 받는 사람당 하루 한 번이다(`schedule-ask.ts`).
 *
 * @returns 보냈으면 `"sent"`, 오늘 이미 보냈으면 `"already"`.
 */
export async function askForTimetable(memberId: string): Promise<"sent" | "already"> {
  const me = await requireSessionMember();
  if (memberId === me.id) throw new Error("자기 자신에게는 부탁할 수 없습니다.");

  // 화면이 보낸 id 가 정말 우리 팀의 지금 팀원인지 서버에서 확인한다.
  const target = await db.member.findFirst({
    where: { id: memberId, teamId: me.teamId, leftAt: null },
    select: { id: true },
  });
  if (!target) throw new Error("팀원을 찾을 수 없습니다.");

  if ((await askedTodayBy(me.id, target.id)).size > 0) return "already";

  await notify({
    to: [target.id],
    kind: SCHEDULE_ASK_KIND,
    title: `${me.name}님이 시간표를 부탁했습니다`,
    body: "안 되는 시간을 표시해 두면 회의 시간을 함께 고를 수 있습니다",
    href: "/schedule",
    actorId: me.id,
  });

  revalidatePath("/schedule/team");
  return "sent";
}
