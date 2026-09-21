"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { rebuildMeetingCandidates } from "@/server/meetings/candidates";
import { requireSessionMember } from "@/server/session";
import type { BusyBlock } from "@/lib/types";

/**
 * 08 내 시간표 저장.
 *
 * 내 시간표는 나만 고칠 수 있다 — 세션의 회원 것만 지우고 다시 넣는다.
 * 화면이 보내는 `memberId` 를 믿지 않는 이유는, 서버 액션이 화면을 거치지 않고
 * 바로 불릴 수 있기 때문이다.
 */
export async function saveMyBusyBlocks(blocks: BusyBlock[]): Promise<void> {
  const me = await requireSessionMember();

  await db.$transaction([
    db.busyBlock.deleteMany({ where: { memberId: me.id } }),
    db.busyBlock.createMany({
      data: blocks.map((b) => ({
        memberId: me.id,
        day: b.day,
        startHour: b.startHour,
        hours: b.hours,
        kind: b.kind,
      })),
    }),
  ]);

  // 후보는 저장된 값이 아니라 시간표에서 나오는 계산 결과다 — 시간표가 바뀌면 다시 만든다.
  await rebuildMeetingCandidates(me.teamId);

  revalidatePath("/schedule", "layout");
}
