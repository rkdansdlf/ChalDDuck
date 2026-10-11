import type { MemberWorkSummary } from "@/lib/types";

/**
 * 07 수행 기록 줄의 **문구** — 화면이 아니라 여기서 정한다(빈 상태를 검사로 고정하기 위해서다).
 *
 * ## 원칙
 *
 * - **기록이 없다고 일을 안 했다는 뜻이 아니다.** 기록은 역할을 고른 할 일과 제출함 업로드에서만 쌓인다.
 *   그래서 "0건" 이라고만 말하지 않고, **왜 비어 보이는지** 아는 만큼 말한다 — 의견이 달려 확인 중인지,
 *   역할에 연결되지 않은 기록이 따로 있는지, 정말 아직 아무것도 없는지.
 * - 확인된 기록과 확인 대기를 구분한다.
 * - 의견 차이는 건수·내용을 싣지 않는다(17·18 에서 본다).
 * - 평가어(부족·우수·성실)와 비율을 쓰지 않는다.
 */
export type WorkRole = MemberWorkSummary["roles"][number];

/** 한 역할의 기록 문구. */
export function workLineOf(role: WorkRole, hasUnlinked: boolean): string {
  if (role.confirmed > 0 || role.pending > 0) {
    const parts: string[] = [];
    if (role.confirmed > 0) parts.push(`확인된 기록 ${role.confirmed}건`);
    if (role.pending > 0) parts.push(`확인 대기 ${role.pending}건`);
    return parts.join(" · ");
  }
  // 보이는 기록은 없는데 의견이 달린 기록이 있다 — "없다" 고 하면 거짓이다.
  if (role.underReview) return "확인 중인 기록이 있어요";
  if (hasUnlinked) return "이 역할에 연결된 기록은 아직 없어요 · 역할에 연결되지 않은 기록은 기여 기록에서 볼 수 있어요";
  return "아직 기여 기록이 없어요";
}

/** 맡지 않은 다른 역할의 기록 문구. 없으면 `null`(줄을 만들지 않는다). */
export function othersLineOf(others: number): string | null {
  return others > 0 ? `다른 역할로 수행한 기록 ${others}건` : null;
}

/** 패널 맨 아래 한 줄 — 이 숫자가 무엇이고 무엇이 아닌지. */
export const WORK_CAPTION =
  "역할에 연결된 기록만 보여요. 역할을 다시 나눌 때 참고하는 자료이고, 성실도를 따지는 숫자가 아니에요. 전체 기록은 기여 기록에서 볼 수 있어요.";
