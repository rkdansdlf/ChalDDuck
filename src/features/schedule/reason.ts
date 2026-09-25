import type { BusyKind, BusyKindKey } from "@/lib/types";

/**
 * 블록을 막는 사유 — 기본 사유(`class`…)이거나, 본인이 이름을 붙인 `custom`.
 *
 * 격자·목록·시트가 사유를 **같은 이름·같은 모양**으로 그리도록 여기서 한 번 정한다.
 */
export type Reason = { kind: BusyKindKey; label: string | null };

export type ReasonLook = {
  name: string;
  /** 칸 배경. 직접 입력은 사선 무늬다. */
  background: string;
  /** 범례·칩의 작은 네모. */
  swatch: string;
  custom: boolean;
};

/**
 * 직접 입력 사유의 무늬.
 *
 * 색 토큰(`--busy-custom`)이 아직 임시값이라 색 하나에 기대지 않는다 — 무늬로 "직접 입력"임을,
 * 이름표로 어떤 일정인지를 알린다.
 */
function stripes(color: string) {
  return `repeating-linear-gradient(135deg, ${color} 0 6px, var(--cr-300) 6px 9px)`;
}

export function lookOf(reason: Reason, kinds: BusyKind[], customKind: BusyKind): ReasonLook {
  if (reason.kind === "custom") {
    return {
      name: reason.label ?? customKind.name,
      background: stripes(customKind.color),
      swatch: stripes(customKind.color),
      custom: true,
    };
  }
  const k = kinds.find((x) => x.key === reason.kind) ?? kinds[0];
  return { name: k.name, background: k.color, swatch: k.color, custom: false };
}

export function sameReason(a: Reason, b: Reason): boolean {
  return a.kind === b.kind && (a.kind !== "custom" || a.label === b.label);
}
