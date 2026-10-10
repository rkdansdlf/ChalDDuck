import { ELEMENT_KO, type Element } from "./engine";
import { MEETING_FLOW_STEPS, MEETING_TIP } from "./copy";

/**
 * 회의 진행 방식 — 회의 길이에 맞춰 세 단계의 시간을 나눈다.
 *
 * 시간 배분만 계산한다. 단계의 말은 `copy.ts` 의 고정 문구다. 누가 어느 단계를 맡는다는 말은 없다 —
 * 사주로 사람의 역할을 정하지 않는다.
 *
 * 규칙: 결정에 **마지막 10분**(30분 미만이면 5분), 나머지를 아이디어:합치기 = 6:4 로 나눈다.
 * 모두 5분 단위이고 합이 회의 길이와 같다. 회의 길이는 15–240분으로 맞춰서 계산한다 — 5분씩
 * 세 단계가 나오지 않는 길이는 이 진행 방식이 맞지 않는다.
 */

export const MIN_MEETING_MINUTES = 15;
export const MAX_MEETING_MINUTES = 240;

export type PlannedStep = { n: number; title: string; desc: string; minutes: number };

export function planMeetingFlow(durationMinutes: number): { total: number; steps: PlannedStep[] } {
  const raw = Number.isFinite(durationMinutes) ? Math.round(durationMinutes / 5) * 5 : 60;
  const total = Math.min(MAX_MEETING_MINUTES, Math.max(MIN_MEETING_MINUTES, raw));
  const decide = total >= 30 ? 10 : 5;
  const rest = total - decide;
  const first = Math.min(rest - 5, Math.max(5, Math.round((rest * 0.6) / 5) * 5));
  const minutes = [first, rest - first, decide];
  return {
    total,
    steps: MEETING_FLOW_STEPS.map((s, i) => ({ n: i + 1, title: s.title, desc: s.desc, minutes: minutes[i]! })),
  };
}

/** 단톡방·메모에 붙여 넣을 글. 단계, 시간, 그리고 가장 적게 센 오행의 제안. */
export function meetingFlowText(plan: ReturnType<typeof planMeetingFlow>, lowest: readonly Element[]): string {
  const lines = [`[회의 진행 방식] ${plan.total}분`];
  for (const s of plan.steps) lines.push(`${s.n}) ${s.title} (${s.minutes}분) — ${s.desc}`);
  if (lowest.length > 0) {
    lines.push("", "챙겨 볼 것");
    for (const e of lowest.slice(0, 2)) lines.push(`- ${ELEMENT_KO[e]}: ${MEETING_TIP[e]}`);
  }
  return lines.join("\n");
}
