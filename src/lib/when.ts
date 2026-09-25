/**
 * "언제"를 사람이 읽는 말로 — "방금", "12분 전", "오늘 14:20", "어제 21:14", "9/14 22:05".
 *
 * **서버에서 부른다.** 브라우저마다 시간대가 달라 같은 버전이 사람마다 다른 날로 보이면
 * 안 되고(팀원이 해외에 있을 수도 있다), 서버 렌더와 브라우저 렌더가 달라 첫 화면이
 * 깜빡이는 것도 막는다. 기준 시간대는 한국이다.
 *
 * 예전에는 올릴 때 "방금"을 문자열로 저장해서, 어제 올린 파일이 계속 "방금"으로 보였다.
 */

const ZONE = "Asia/Seoul";

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function kst(at: Date) {
  const parts = PARTS.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 한국 날짜로 며칠 차이인지(시각은 무시). */
function dayDiff(a: ReturnType<typeof kst>, b: ReturnType<typeof kst>): number {
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86_400_000);
}

export function formatWhen(at: Date, now: Date = new Date()): string {
  const seconds = (now.getTime() - at.getTime()) / 1000;
  if (seconds < 60) return "방금";
  if (seconds < 60 * 60) return `${Math.floor(seconds / 60)}분 전`;

  const t = kst(at);
  const today = kst(now);
  const clock = `${pad(t.hh)}:${pad(t.mm)}`;
  const days = dayDiff(today, t);
  if (days === 0) return `오늘 ${clock}`;
  if (days === 1) return `어제 ${clock}`;
  if (t.y === today.y) return `${t.m}/${t.d} ${clock}`;
  return `${t.y}. ${t.m}/${t.d}`;
}

/** 마감 표시 — "9/15 23:59". 상대 표현을 쓰지 않는다(마감은 날짜로 기억한다). */
export function formatDue(at: Date): string {
  const t = kst(at);
  return `${t.m}/${t.d} ${pad(t.hh)}:${pad(t.mm)}`;
}

/** `<input type="datetime-local">` 값("2026-09-15T23:59") ↔ 시각. 한국 시간으로 읽고 쓴다. */
export function toKstInputValue(at: Date): string {
  const t = kst(at);
  return `${t.y}-${pad(t.m)}-${pad(t.d)}T${pad(t.hh)}:${pad(t.mm)}`;
}

export function fromKstInputValue(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = new Date(`${value}:00+09:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}
