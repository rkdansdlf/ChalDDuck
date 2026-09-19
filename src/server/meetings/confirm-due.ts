import "server-only";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";

/**
 * 마감이 지난 제안을 확정으로 바꾼다 — **예약 작업이 부르는 자리.**
 *
 * 서버 액션이 아니라 평범한 서버 모듈로 둔다. `"use server"` 파일에 넣으면 누구나
 * POST 로 부를 수 있는 입구가 하나 더 생기는데, 이 함수는 사람이 아니라 스케줄러가
 * 부르는 것이라 세션 확인이 없다.
 *
 * 화면은 `effectiveStage()` 로 이미 확정된 것처럼 보여 준다. 그래도 표를 고치는 이유는,
 * "언제 확정됐는지"를 나중에 묻거나 알림을 붙이려면 상태가 실제로 남아 있어야 하기 때문이다.
 *
 * @returns 확정으로 바꾼 제안 수.
 */
export async function confirmDueMeetings(): Promise<number> {
  const due = await db.meetingProposal.findMany({
    where: { stage: "proposed", respondBy: { lte: new Date() } },
    select: { id: true },
  });
  if (due.length === 0) return 0;

  // 반대가 하나라도 있으면 확정하지 않는다 — 규칙은 여기서도 같다.
  const objected = await db.meetingResponse.findMany({
    where: { proposalId: { in: due.map((p) => p.id) }, agree: false },
    select: { proposalId: true },
  });
  const blocked = new Set(objected.map((r) => r.proposalId));
  const confirmable = due.filter((p) => !blocked.has(p.id)).map((p) => p.id);

  if (confirmable.length === 0) return 0;

  await db.meetingProposal.updateMany({
    where: { id: { in: confirmable } },
    data: { stage: "confirmed" },
  });

  revalidatePath("/schedule", "layout");
  revalidatePath("/home");
  return confirmable.length;
}
