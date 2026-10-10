import { MIN_YEAR, isRealDate, type BirthInput } from "./engine";

/**
 * 생년월일(시) 입력 검사 — 화면과 서버 액션이 **같은 함수**를 쓴다.
 *
 * 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수 있다. 화면이 날짜 선택기로 막았다는
 * 사실은 보호가 되지 못하므로, 서버가 이 함수로 다시 본다. 그리고 두 쪽이 서로 다른 규칙을
 * 갖지 않도록 규칙을 한 곳에 둔다.
 */

export type BirthBlock = "bad-date" | "bad-time" | "too-old" | "future";

/** 거절 이유를 사용자에게 말하는 문장. 무엇을 고치면 되는지가 담긴다. */
export const BIRTH_BLOCK_MESSAGE: Record<BirthBlock, string> = {
  "bad-date": "생년월일을 확인해 주세요.",
  "bad-time": "출생 시각을 확인해 주세요. 모르면 비워 두셔도 됩니다.",
  "too-old": `${MIN_YEAR}년 이후 출생만 계산할 수 있어요.`,
  future: "오늘 이후의 날짜는 넣을 수 없어요.",
};

export type ParsedBirth =
  | {
      ok: true;
      /** `YYYY-MM-DD` — 저장하는 값. */
      date: string;
      /** `HH:MM` — 모르면 `null`. */
      time: string | null;
      input: BirthInput;
    }
  | { ok: false; reason: BirthBlock };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** 지금 한국 날짜(`YYYY-MM-DD`). 서버 시계가 UTC 여도 한국 날짜로 비교한다. */
export function todayKst(now: number = Date.now()): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * `date` 는 `YYYY-MM-DD`, `time` 은 `HH:MM` 또는 비어 있음(모름).
 *
 * 저장은 문자열 그대로 한다 — 시간대가 낀 `Date` 로 바꿔 넣으면 서버의 시간대에 따라 하루가
 * 밀린다. 사주는 달력 위의 날짜와 시계 위의 시각이라 **문자열이 원본**이다.
 */
export function parseBirth(date: string, time: string | null, today: string = todayKst()): ParsedBirth {
  const d = DATE_RE.exec(date.trim());
  if (!d) return { ok: false, reason: "bad-date" };
  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  if (!isRealDate(year, month, day)) return { ok: false, reason: "bad-date" };
  if (year < MIN_YEAR) return { ok: false, reason: "too-old" };
  const iso = `${d[1]}-${d[2]}-${d[3]}`;
  if (iso > today) return { ok: false, reason: "future" };

  const rawTime = time?.trim() ?? "";
  if (rawTime === "") {
    return { ok: true, date: iso, time: null, input: { year, month, day, hour: null, minute: null } };
  }
  const t = TIME_RE.exec(rawTime);
  if (!t) return { ok: false, reason: "bad-time" };
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (hour > 23 || minute > 59) return { ok: false, reason: "bad-time" };
  return {
    ok: true,
    date: iso,
    time: `${t[1]}:${t[2]}`,
    input: { year, month, day, hour, minute },
  };
}

/** 저장된 문자열 두 개를 다시 계산 입력으로. 저장값이 깨져 있으면 `null`(오늘 날짜 검사는 건너뛴다). */
export function birthInputFromStored(date: string, time: string | null): BirthInput | null {
  const parsed = parseBirth(date, time, "9999-12-31");
  return parsed.ok ? parsed.input : null;
}
