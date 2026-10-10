"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { rebuildMeetingCandidates } from "@/server/meetings/candidates";
import { SCHEDULE_ASK_KIND } from "@/server/meetings/schedule-ask";
import { notify } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";
import { BUSY_KINDS, SCHEDULE_DAYS, SCHEDULE_HOURS } from "@/data/catalog";
import { normalizeBusyLabel } from "@/features/schedule/busy-blocks";
import { isWeekKey, scheduleWeeks, todayInSeoul } from "@/features/schedule/week";
import type { BusyBlock } from "@/lib/types";

const PRESET_KINDS = new Set<string>(BUSY_KINDS.map((k) => k.key));

/**
 * 화면이 보낸 블록 하나를 저장할 행으로. 시간표 밖이거나 사유가 이상하면 거절한다 —
 * 서버 액션은 화면을 거치지 않고 바로 불릴 수 있다.
 */
function toRow(b: BusyBlock, weeks: string[]) {
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

  // "이 주만"은 지금 볼 수 있는 주에만 적을 수 있다.
  const weekOf = b.weekOf ?? null;
  if (weekOf !== null && (!isWeekKey(weekOf) || !weeks.includes(weekOf))) {
    throw new Error("적을 수 없는 주입니다.");
  }

  if (b.kind === "custom") {
    const label = normalizeBusyLabel(b.label ?? "");
    if (!label) throw new Error("직접 입력한 사유의 이름을 확인해 주세요.");
    return { day: b.day, startHour: b.startHour, hours: b.hours, kind: "custom", label, weekOf };
  }
  if (!PRESET_KINDS.has(b.kind)) throw new Error("알 수 없는 사유입니다.");
  // 기본 사유에는 이름이 붙지 않는다 — 화면이 보낸 값이 있어도 버린다.
  return { day: b.day, startHour: b.startHour, hours: b.hours, kind: b.kind, label: null, weekOf };
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
  const weeks = scheduleWeeks();
  // 화면은 같은 요일·같은 범위(매주 · 볼 수 있는 각 주) 안에서 블록이 겹치지 않게 막으므로(`placeBlock`)
  // 정상적인 시간표는 칸 수 × 범위 수를 넘을 수 없다. 서버는 겹침을 거절하지 않으니, 상한이 없으면
  // 한 번의 저장이 몇만 줄을 쓴다.
  const MAX_BLOCKS = SCHEDULE_DAYS.length * SCHEDULE_HOURS.length * (weeks.length + 1);
  if (blocks.length > MAX_BLOCKS) throw new Error("시간 블록이 너무 많습니다.");
  const rows = blocks
    // 화면을 연 사이에 주가 넘어가(일요일 밤 → 월요일) 지나간 주가 된 것은 조용히 버린다 —
    // 이미 끝난 주라 적을 이유가 없고, 거절하면 저장 자체가 실패한다.
    .filter((b) => !b.weekOf || b.weekOf >= weeks[0])
    .map((b) => toRow(b, weeks));

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

  // 읽어 보고 쓰는 두 걸음이 아니라 **쓰는 한 걸음**이 문이다 — 동시에 두 번 눌러도 유일 키가
  // 두 번째를 막는다(`ScheduleAsk`). 먼저 읽어 보는 길은 둘 다 통과했다.
  const sentOn = todayInSeoul();
  let ask: { id: string };
  try {
    ask = await db.scheduleAsk.create({
      data: { senderId: me.id, targetId: target.id, sentOn },
      select: { id: true },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return "already";
    throw error;
  }

  try {
    await notify({
      to: [target.id],
      kind: SCHEDULE_ASK_KIND,
      title: `${me.name}님이 시간표를 부탁했습니다`,
      body: "안 되는 시간을 표시해 두면 회의 시간을 함께 고를 수 있습니다",
      href: "/schedule",
      actorId: me.id,
    });
  } catch (error) {
    // 알림이 가지 못했는데 "오늘은 이미 보냄" 이 남으면 하루 한 번을 태우고 아무도 모른다.
    await db.scheduleAsk.delete({ where: { id: ask.id } }).catch(() => {});
    throw error;
  }

  revalidatePath("/schedule/team");
  return "sent";
}
