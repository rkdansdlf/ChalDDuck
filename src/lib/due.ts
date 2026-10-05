/**
 * 업무 마감의 자유 텍스트를 **기계가 비교할 수 있는 시각**으로 바꾸는 순수 계산.
 *
 * ## 왜 이 파일이 있는지
 *
 * `Task.due` 는 **자유 텍스트**다. 실제로 저장된 값이 `"9/19"`, `"9월쯤"`, `"다음 주"`,
 * `"미정"`, `"다음 발표까지"` 가 섞여 있다(`dueOf` 가 빈 값을 `"미정"` 으로 만든다).
 * 그래서 브리핑은 "마감이 가까운 업무 N건" 을 **셀 수 없었다** — 비교할 시각이 없었기 때문이다.
 * 2단계에서 그 자리를 **"아직 안 정한 일"** 로 바꿔 수 있었다가, 여기서 정규값을 넣으면
 * 진짜로 셀 수 있게 된다.
 *
 * ## 대각선 — **해석하지 않은 것은 `null` 이다**
 *
 * 파싱이 성공했다고 **확신할 수 없을 때 `null` 을 돌려준다.** "9/19" 는 올해로 읽으면 되지만
 * **올바른 해가 아닐 수 있다**(12월에 "1/5" 를 쓰면 다음 해다). 그럴 확률이 있는 자리를
 * 확정값으로 넣으면 **브리핑이 틀린 숫자를 말하고, 그 숫자를 보고 사람이 독촉한다.**
 * 틀린 숫자 없는 것(아무것도 세지 않는 것)이 낫다.
 *
 * 그래서 **명시된 해만** 받아들인다:
 * - `"2026-09-19"` — 연도가 있다 → 그대로. (이것만 **완전히 확실**하다)
 * - `"9/19"` — 연도가 없다 → **오늘을 기준으로** 가장 가까운 해를 고르되, **이미 지나간
 *   해를 고르면 안 된다.** 오늘이 9월 30일인데 "10/5" 라면올해, 오늘이 12월 20일인데 "1/5"
 *   라면 **다음 해**다. 어느 쪽이 의도인지 **모르면 `null`** 이 정답이다.
 * - `"9월쯤"`·`"다음 주"`·`"미정"`·`"다음 발표까지"` — 전부 `null`. **사람의 뜻을 대신 정하지 않는다.**
 *
 * ## 기존 값을 되돌려 해석하지 않는다 (백필 없음)
 *
 * 마이그레이션에서 기존 행의 `dueAt` 을 **채우지 않는다.** 2025년에 "9/19" 를 쓴 행이
 * 2026년의 어느 날인지 **누구도 모른다.** 추측해 채우면 그 값이 **근거 없는 사실**로 남고
 * "마감 임박" 이 그 추측 위에 선다. `null` 은 "모르겠다" 를 정직하게 말하는 값이다.
 *
 * ## 24시로 끝나지 않는다
 *
 * `SubmissionBox.dueAt` 과 같은 규칙이다 — 하루의 끝(23:59)로 붙여 **"오늘 마감이면 오늘
 * 임박"** 이라고 말할 수 있게 한다.
 */

/** 하루의 끝(한국 시간). 하루 단위로만 비교하므로 시각은 임의로 정해도 일관된다. */
const END_OF_DAY = "23:59";

/** `2026-09-19` 처럼 연도까지 있는 값. **이것만 완전히 확실하다.** */
const FULL_ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;

/** `9/19` 처럼 연도가 없는 값. */
const SHORT = /^(\d{1,2})\/(\d{1,2})$/;

/** 한국 날짜 문자열(`YYYY-MM-DD`) → 그날 23:59 시의 UTC 시각. */
function endOfSeoulDay(day: string): Date | null {
  const at = new Date(`${day}T${END_OF_DAY}:00+09:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** `2026-02-30` 처럼 **존재하지 않는 날**을 거른다 — `Date` 는 조용히 3월 2일로 넘어간다. */
function isRealDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/**
 * 자유 텍스트 마감 → 시각. **해석할 수 없으면 `null`.**
 *
 * @param text 사용자가 쓴 값.
 * @param today 한국 날짜(`YYYY-MM-DD`). **이제 몇 년인지** 를 정하는 데 쓴다 — 화면이 자기
 *   시계로 맞추면 기기 설정이 다른 사람과 **같은 업무의 마감이 다르게** 보인다.
 */
export function parseDueText(text: string | null | undefined, today: string): Date | null {
  const trimmed = (text ?? "").trim();
  if (trimmed === "") return null;

  // 1) 연도가 있으면 그대로 믿는다 — 이것만 확실하다.
  const iso = FULL_ISO.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    const year = Number(y);
    if (!isRealDay(year, Number(m), Number(d))) return null;
    return endOfSeoulDay(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }

  // 2) 연도가 없으면 **아직 지나가지 않은 해** 를 고른다.
  const short = SHORT.exec(trimmed);
  if (!short) return null;

  const month = Number(short[1]);
  const day = Number(short[2]);
  const thisYear = Number(today.slice(0, 4));
  if (!isRealDay(thisYear, month, day)) return null;

  const thisYearEnd = endOfSeoulDay(today);
  if (!thisYearEnd) return null;

  // ⚠️ **올바른 해가 둘이면 `null` 이다.** 오늘 6월인데 "1/5" 라면 — 작년 1/5는 지났고
  //    올해 1/5는 지났고, 다음 해 1/5는 아직이다. 그런데 12월에 쓴 "1/5" 를 누가 6월에
  //    고치는지는 **모른다.** 추측해서 배정하지 않는다.
  let candidateYear = thisYear;
  const candidate = endOfSeoulDay(`${candidateYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if (candidate && candidate.getTime() < thisYearEnd.getTime()) candidateYear += 1;

  // ⚠️ **여기서도 모르면 `null`.** 확정할 수 있는 경우는 "올해가 아직 안 지났거나" 또는
  //    "내일이면 확실히 다음 해" 다. 그 사이가 흐리면 브리핑은 그 일을 세지 않는다.
  const inThisYear = candidate && candidate.getTime() >= thisYearEnd.getTime();
  const clearlyNextYear = month < Number(today.slice(5, 7));
  if (!inThisYear && !clearlyNextYear) return null;

  return endOfSeoulDay(`${candidateYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

/** 두 시각 사이의 **하루** 수(앞쪽 − 뒤쪽). 음수가 될 수 있다. */
export function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

/**
 * "마감이 N일 남았다 / 지났다 / 오늘이다" — 사람이 읽는 말.
 *
 * ⚠️ **모르는 마감(null)에 대한 말을 만들지 않는다.** "마감을 모릅니다" 를 브리핑에 넣으면
 * 브리핑의 다른 줄까지  의심스러워진다. **모르는 것은 세지 않는 쪽이 정답이다.**
 */
export function duePhrase(dueAt: Date | null, now: Date): string | null {
  if (!dueAt) return null;
  const days = daysBetween(dueAt, now);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === -1) return "어제";
  if (days > 0) return `${days}일 뒤`;
  return `${Math.abs(days)}일 지남`;
}

/**
 * 브리핑의 "마감 임박" — **몇 일 이내인가**를 정한다.
 *
 * ⚠️ **이미 지난 마감은 세지 않는다.** 그것은 "임박" 이 아니라 "늦었다" 이고, 다른 일의
 * 말이다(늦은 건 이미 빨갛게 보인다). "3일 이내" 는 **0~3일** 을 뜻한다 — 오늘 마감도 임박이다.
 */
export function isDueSoon(dueAt: Date | null, now: Date, withinDays = 3): boolean {
  if (!dueAt) return false;
  const days = daysBetween(dueAt, now);
  return days >= 0 && days <= withinDays;
}