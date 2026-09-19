import type { MeetingProposal } from "@/lib/types";

/**
 * 회의 확정 규칙.
 *
 * 한 줄로 쓰면 이렇다 — **응답 마감까지 반대가 하나도 없으면 확정된다.**
 * 특정 한 사람이 단독으로 확정하지 않는다.
 *
 * 이 규칙을 순수 함수로 떼어 둔 이유: 같은 판단을 세 곳이 해야 한다.
 * 화면(09/홈/배지)이 지금 무엇을 보여 줄지, 예약 작업이 무엇을 확정으로 바꿀지,
 * 응답 액션이 늦은 반대를 받아 줄지. 세 곳이 각자 판단하면 "화면은 확정이라는데
 * 눌러 보니 아직 대기 중" 같은 어긋남이 생긴다.
 */

export type StoredStage = MeetingProposal["stage"];

/**
 * 지금 이 제안이 실제로 어떤 상태인지.
 *
 * 저장된 `stage` 를 그대로 믿지 않는 이유: 마감은 시각이 지나면 **저절로** 오는 일이라
 * 아무도 앱을 열지 않아도 지나간다. 예약 작업이 표를 고쳐 주기 전에 누가 화면을 열면
 * 이미 지난 마감이 "제안 대기 중"으로 보인다. 그래서 화면에는 계산한 값을 보여 주고,
 * 표는 예약 작업이 뒤따라 맞춘다.
 */
export function effectiveStage(proposal: {
  stage: StoredStage;
  respondBy: Date | null;
  against: number;
}): StoredStage {
  if (proposal.stage !== "proposed") return proposal.stage;
  if (!proposal.respondBy) return proposal.stage;

  // 반대가 하나라도 있으면 마감이 지나도 확정되지 않는다.
  // (지금 구현에서는 반대하면 제안 자체가 사라지지만, 규칙은 여기에도 적어 둔다.)
  if (proposal.against > 0) return "proposed";

  return proposal.respondBy.getTime() <= Date.now() ? "confirmed" : "proposed";
}

/** 응답 마감이 지났는지. 지난 뒤의 반대는 받지 않는다. */
export function isPastDeadline(respondBy: Date | null): boolean {
  return respondBy !== null && respondBy.getTime() <= Date.now();
}
