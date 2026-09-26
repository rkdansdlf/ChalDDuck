/**
 * 시간표의 "주".
 *
 * 주는 **그 주 월요일의 한국 날짜**("2026-09-28") 로 가리킨다. 시각(`Date`)이 아니라 날짜
 * 문자열인 이유: 서버가 어느 시간대에서 돌든, 화면이 어느 시간대에 있든 같은 주여야 하고,
 * 문자열이면 비교(`<`)와 저장이 그대로 된다.
 *
 * 날짜 계산은 여기 한 곳에서만 한다 — 서버(저장 검사·후보 계산)와 화면(주 고르기)이 각자
 * 계산하면 일요일 밤에 서로 다른 주를 "이번 주"라고 부른다.
 */

export type WeekKey = string;

/** 앞으로 볼 수 있는 주의 수. 시험 기간이 보통 2주라서 — 확정되지 않은 정책이다. */
export const VIEWABLE_WEEKS = 2;

const DAY = 24 * 60 * 60 * 1000;

/** "YYYY-MM-DD" → 그날 0시(UTC 기준 계산용). 시간대가 끼지 않게 UTC 로만 다룬다. */
function parse(key: WeekKey): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): WeekKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: WeekKey, days: number): WeekKey {
  return format(new Date(parse(key).getTime() + days * DAY));
}

/** 지금 한국 날짜. */
export function todayInSeoul(now: Date = new Date()): WeekKey {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

/** 그 날짜가 속한 주의 월요일. */
export function mondayOf(key: WeekKey): WeekKey {
  const weekday = parse(key).getUTCDay(); // 0 = 일요일
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

/** 형식이 맞는 월요일 날짜인지. 서버가 화면이 보낸 값을 믿지 않을 때 쓴다. */
export function isWeekKey(value: unknown): value is WeekKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return format(parse(value)) === value && mondayOf(value) === value;
}

/** 지금 볼 수 있는 주들 — 오늘이 속한 주(월~일)부터. 첫 주가 기본으로 보인다. */
export function scheduleWeeks(now: Date = new Date()): WeekKey[] {
  const first = mondayOf(todayInSeoul(now));
  return Array.from({ length: VIEWABLE_WEEKS }, (_, i) => addDays(first, i * 7));
}

/** 회의 후보를 찾는 기간(일). 7일이면 요일마다 딱 하루씩이라 "수 16:00" 이 어느 날인지 하나로 정해진다. */
export const CANDIDATE_DAYS = 7;

export type CandidateDate = {
  /** 그 날의 한국 날짜. */
  date: string;
  /** 그 날이 속한 주(월요일). "이 주만" 블록을 고를 때 쓴다. */
  week: WeekKey;
  /** 0 = 월 … 6 = 일. `SCHEDULE_DAYS` 의 인덱스. */
  day: number;
};

/**
 * 회의 후보를 찾는 날들 — **오늘부터 7일.**
 *
 * 한 주(월~일)로 고정하면 목요일에는 이미 지난 월~수가 후보로 나오고, 일요일에는 고를 날이
 * 하루뿐이다. 오늘부터 7일이면 늘 앞으로의 일주일이고, 요일이 겹치지 않는다.
 */
export function candidateDates(now: Date = new Date()): CandidateDate[] {
  const today = todayInSeoul(now);
  return Array.from({ length: CANDIDATE_DAYS }, (_, i) => {
    const date = addDays(today, i);
    const week = mondayOf(date);
    return { date, week, day: Math.round((parse(date).getTime() - parse(week).getTime()) / DAY) };
  });
}

/** "9/28" */
export function shortDate(key: WeekKey): string {
  const d = parse(key);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** 그 주의 `day`(0 = 월) 요일 날짜. "10/1" */
export function dateOfDay(week: WeekKey, day: number): string {
  return shortDate(addDays(week, day));
}

/** "9/28–10/4" (월~일) */
export function weekRange(week: WeekKey): string {
  return `${shortDate(week)}–${shortDate(addDays(week, 6))}`;
}

/** 오늘을 기준으로 부르는 이름. "이번 주" / "다음 주" / "다다음 주" */
export function weekName(week: WeekKey, now: Date = new Date()): string {
  const diff = Math.round((parse(week).getTime() - parse(mondayOf(todayInSeoul(now))).getTime()) / (7 * DAY));
  return diff <= 0 ? "이번 주" : diff === 1 ? "다음 주" : "다다음 주";
}
