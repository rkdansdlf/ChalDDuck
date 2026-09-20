import "server-only";

import { db } from "@/server/db";

/**
 * 기여 기록의 상태 규칙 — **한 곳에서만 정한다.**
 *
 * 세 가지가 상태를 바꾼다: 팀원의 확인, 누군가 적은 의견, 그 의견에 대한 응답.
 * 각자 고치면 "확인 3명인데 대기 중" 같은 어긋남이 생기므로, 무엇이 바뀌든
 * 이 함수를 다시 불러 계산한다.
 *
 * 규칙:
 * - 적힌 의견이 있고 아직 정리되지 않았으면 **의견 차이**. 확인 수와 무관하다 —
 *   사실이 다투어지는 중에 "확인됨"으로 보이면 안 된다.
 * - 팀원이 한 명이라도 확인했으면 **확인됨**.
 * - 아무도 확인하지 않았으면 **대기**.
 *
 * 몇 명이 확인해야 하는지는 확정되지 않은 정책이다. 전원으로 두면 한 사람이 답하지
 * 않을 때 영영 확정되지 않아, 지금은 한 명으로 둔다(17 화면이 그 사실을 적는다).
 */
export const CONFIRMS_NEEDED = 1;

export type ContribState = "ok" | "pending" | "disputed";

export function contribState(input: {
  confirms: number;
  dispute: string | null;
  resolution: string | null;
}): ContribState {
  if (input.dispute && !input.resolution) return "disputed";
  return input.confirms >= CONFIRMS_NEEDED ? "ok" : "pending";
}

/** 표에 저장된 `state` 를 다시 계산해 맞춘다. 기록을 건드린 액션이 마지막에 부른다. */
export async function refreshContribState(recordId: string): Promise<ContribState> {
  const record = await db.contribRecord.findUnique({
    where: { id: recordId },
    select: { dispute: true, resolution: true, _count: { select: { confirms: true } } },
  });
  if (!record) throw new Error("기록을 찾을 수 없습니다.");

  const state = contribState({
    confirms: record._count.confirms,
    dispute: record.dispute,
    resolution: record.resolution,
  });

  await db.contribRecord.update({ where: { id: recordId }, data: { state } });
  return state;
}

/** 화면에 보일 확인 상태 문구. 저장하지 않고 그때그때 만든다. */
export function contribByLabel(input: {
  state: ContribState;
  confirms: number;
  disputedBy: string | null;
}): string {
  if (input.state === "disputed") {
    return input.disputedBy ? `${input.disputedBy} · 의견 차이 1건` : "의견 차이 1건";
  }
  return input.confirms > 0 ? `${input.confirms}명 확인` : "팀원 확인 대기";
}
