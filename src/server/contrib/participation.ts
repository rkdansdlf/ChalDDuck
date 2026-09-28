import "server-only";

/**
 * 회의 참여 표시의 규칙 — **한 곳에서만 정한다.**
 *
 * 표시의 주체는 팀장이고(자동 판정하지 않는다), 붙는 곳은 기록 하나다. 이 모듈은 그 두
 * 가지가 **확인과 섞이지 않게** 지키는 자리다 — 참여한다고 기록이 확정되지 않는다. 기록이
 * 사실인 것과 그 일을 그 사람이 했다는 것은 다른 말이다(근거를 붙여 준 사람이 실제로는
 * 다른 사람이 했을 수 있다).
 */

/** 화면에 보이는 현재 표시 하나. */
export type Participation = {
  recordId: string;
  /** 현재 표시 중이면 그 기록의 id, 취소했으면 null. */
  activeKey: string | null;
  shownBy: string;
  shownAt: Date | string;
  clearedBy: string | null;
  clearedAt: Date | string | null;
};

/** 지금 표시 중인가. 취소된 행도 목록에 남으므로 저장된 값을 보고 판단한다. */
export function isMarked(p: { activeKey: string | null } | null | undefined): boolean {
  return Boolean(p?.activeKey);
}

/**
 * 화면에 말할 한 줄.
 *
 * **표시 중인지와 누가 찍었는지를 함께 말한다** — 둘을 따로 놓으면 "참여함"과 "누가 그랬나"가
 * 엇갈린다. 취소된 표시도 문구를 갖는다(지금 보이지 않더라도 17 화면의 이력에는 남는다).
 */
export function participationText(p: Participation | null | undefined): string | null {
  if (!p) return null;
  const at = whenOf(p.shownAt);
  return isMarked(p)
    ? `참여 표시 · ${p.shownBy}님이 직접 표시함${at}`
    : `참여 표시 취소됨 · ${p.clearedBy ?? "누군가"}님이 취소함`;
}

/** 기록 여러 개의 표시를 한 번에 볼 때(17·18 화면). 표시 중인 것만 새순으로 모은다. */
export function currentParticipations(rows: Participation[]): Participation[] {
  return rows.filter(isMarked).sort((a, b) => whenMs(b.shownAt) - whenMs(a.shownAt));
}

function whenOf(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(d);
}

function whenMs(value: Date | string): number {
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
