/**
 * 표면 규칙 — 테두리와 그림자를 동시에 쓰지 않는다.
 * (핸드오프 `ui.jsx` 의 `S` 맵을 Tailwind 클래스로 옮긴 것)
 */
export const SURFACE = {
  /** 작업 카드 — 흰 면 + 얇은 경계 */
  card: "bg-card border border-line",
  /** 채운 면 — 크림, 경계 없음 */
  fill: "bg-fill border border-transparent",
  /** 살짝 따뜻한 흰 면 + 경계 */
  cream: "bg-cr-25 border border-line",
  /** 강조 면 — 옐로 */
  yellow: "bg-yellow-100 border border-transparent",
  /** 알림 면 — 코랄 */
  coral: "bg-coral-100 border border-transparent",
  /** 선택된 상태 */
  sel: "bg-yellow-100 border-[1.5px] border-yellow-500",
  /** 띄운 면 — 경계 없이 그림자로만 */
  raise: "bg-card border-none shadow-lg",
} as const;

export type SurfaceVariant = keyof typeof SURFACE;
