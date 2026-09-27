import { SCHEDULE_DAYS } from "@/data/catalog";
import type { MeetingProposal } from "@/lib/types";
import { dayOf, mondayOf, shortDate, type CandidateDate, type WeekKey } from "./week";

/**
 * 확정·제안된 회의를 시간표 격자 위에 얹는다.
 *
 * **회의는 날짜로 남는다**(`MeetingProposal.date`) — 제안할 때 고른 칸의 날짜를 그때
 * 고정해 두는 이유다. 예전 행처럼 날짜가 비어 있으면 후보 기간(오늘부터 7일)에서 요일로
 * 되짚는다(7일 안에 각 요일은 딱 한 번이라 "수"가 어느 수요일인지 하나로 정해진다).
 *
 * 되짚는 건 **아직 제안일 때에만** 한다. 확정은 지나간 사실이므로 — 다음 주 수요일에
 * 열린 회의가 아니다 — 요일만 보고 다음 수요일을 가리키면 거짓말이 된다. 그럴 때는 날짜를
 * 모른다고 말하고 칸을 그리지 않는다.
 *
 * 08(내 시간표)과 팀 겹쳐보기가 **같은 칸**을 짚어야 하므로 여기 한 곳에서 푼다.
 */

/** 시간표 격자 위에 얹을 회의 표식. */
export type MeetingMark = {
  /** `SCHEDULE_DAYS` 인덱스(0 = 월). */
  day: number;
  /** `SCHEDULE_HOURS` 인덱스. 시간표 밖에서 시작하면 -1. */
  hour: number;
  /** 이 회의가 있는 날 — "2026-09-30". 모르면 null. */
  date: string | null;
  /** 그 날짜가 속한 주(월요일 날짜). 날짜를 모르면 null. */
  week: WeekKey | null;
  /** "16:00 – 18:00". */
  time: string;
  stage: "proposed" | "confirmed";
  /**
   * "9/27 15:00". **제안일 때만** 있다.
   *
   * 확정은 마감 뒤에 정해진 일이라 마감이 없다 — 확정에 마감 시각을 붙이면 아직 응답을
   * 기다리는 것처럼 보인다. 지난 마감을 `confirmed` 로 바꿔 주는 계산은
   * `meeting-model.ts` 의 `effectiveStage` 가 이미 한다.
   */
  deadline: string | null;
};

/**
 * 지금 화면에 얹어야 할 회의 표식. 없으면 null.
 *
 * `hours` 는 화면의 시간 목록이다 — 회의가 8시처럼 시간표 밖에서 시작하면 `hour` 가 -1 이
 * 되고 칸을 그리지 않는다(한 줄 설명만 남는다).
 */
export function meetingMark(
  proposal: MeetingProposal,
  candidateDays: CandidateDate[],
  hours: string[],
): MeetingMark | null {
  // 이월(`carried`)은 결정을 미룬 것이고, 제안도 확정도 아니면 격자에 얹을 회의가 없다.
  if (proposal.stage !== "proposed" && proposal.stage !== "confirmed") return null;
  const slot = proposal.slot;
  if (!slot) return null;

  // 후보 행에는 요일("수")로만 남는다. 날짜는 제안할 때 `MeetingProposal` 에 고정해 두었지만,
  // 예전 행에는 없다 — 그때는 후보 기간에서 되짚는다. 기간이 7일이라 각 요일이 딱 한 번
  // 나오므로 "수"는 하나로 정해진다.
  const date =
    proposal.date ??
    (proposal.stage === "proposed"
      ? (candidateDays.find((d) => SCHEDULE_DAYS[d.day] === slot.day)?.date ?? null)
      : null);

  return {
    day: date ? dayOf(date) : SCHEDULE_DAYS.indexOf(slot.day),
    // "16:00 – 18:00" → 16시 칸.
    hour: hours.findIndex((h) => Number(h) === Number(slot.time.slice(0, 2))),
    date,
    week: date ? mondayOf(date) : null,
    time: slot.time,
    stage: proposal.stage,
    deadline: proposal.stage === "proposed" ? proposal.respondBy : null,
  };
}

/** 격자 한 칸 — `week-grid.tsx` 가 그리는 것은 이것뿐이다. */
export type MeetingCell = Pick<MeetingMark, "day" | "hour" | "stage">;

/**
 * 표식을 격자의 한 칸으로. **보고 있는 주 밖이거나 시간표 밖이면 null.**
 *
 * 두 주를 볼 수 있으므로 확인이 필요하다 — 표식은 회의가 있는 날짜를 알고 있지만 지금
 * 보는 주는 다를 수 있다. 날짜를 모르는 회의(`week` 가 null)도 여기서 걸러진다 — 어느
 * 주의 칸인지 알 수 없으면 그릴 수가 없다.
 */
export function markCell(mark: MeetingMark | null, week: WeekKey): MeetingCell | null {
  if (!mark || mark.hour < 0 || mark.week !== week) return null;
  return { day: mark.day, hour: mark.hour, stage: mark.stage };
}

/**
 * "9/30(수) 16:00 – 18:00" — 회의가 언제인지 적는 한 가지 방법.
 *
 * 날짜를 모르면 요일로만 적는다("수 16:00 – 18:00"). 없는 정보를 지어내지 않는다.
 */
export function whenText(date: string | null, dayLetter: string, time: string): string {
  return date ? `${shortDate(date)}(${dayLetter}) ${time}` : `${dayLetter} ${time}`;
}

/**
 * 격자 아래 한 줄. **칸을 그리지 못한 경우에도** 이 줄이 회의가 있다는 사실을 말해 준다 —
 * 회의는 지난 뒤에도 사실로 남으므로, 격자에 아무것도 없으면 "회의가 없다"로 읽힌다.
 *
 * 제안과 확정은 마감의 유무로 갈린다 — "확정"에 마감 시각을 붙이면 아직 응답을 기다리는
 * 것처럼 보인다. 어느 쪽인지는 칸 위 아이콘(시계/체크)과 범례가 함께 말한다.
 */
export function markText(mark: MeetingMark | null, days: string[]): string | null {
  if (!mark) return null;
  const when = whenText(mark.date, days[mark.day] ?? "", mark.time);
  return mark.stage === "confirmed" ? `${when} · 확정` : `${when} · 응답 마감 ${mark.deadline}`;
}

/**
 * 칸을 **왜** 그리지 못했는지 — 한 줄 뒤에 덧붙이는 말.
 *
 * 이유를 말하지 않으면 "회의가 있는데 왜 격자에 없지"가 그대로 남는다. 셀 수 있는 경우
 * (칸이 있음)는 null 이다.
 */
export function markAside(mark: MeetingMark | null, cell: MeetingCell | null): string | null {
  if (!mark || cell) return null;
  if (mark.hour < 0) return "· 시간표에 없는 시간입니다";
  if (!mark.week) return "· 날짜를 모릅니다";
  return "· 이 주가 아닙니다";
}

/**
 * 회의가 **볼 수 있는 다른 주**에 있으면 그 주로 가는 버튼을 띄운다. 없으면 null.
 *
 * "이 주가 아닙니다"로만 끝내지 않는 이유: 주는 고를 수 있다(2주). 다음 주에 있는 회의라는
 * 사실만 알려 주고 가려면 한 번 더 눌러야 하는데, 그게 더 번거롭다.
 */
export function markJump(
  mark: MeetingMark | null,
  week: WeekKey,
  weeks: readonly { key: string; name: string }[],
): { week: WeekKey; label: string } | null {
  if (!mark?.week || mark.week === week) return null;
  const found = weeks.find((w) => w.key === mark.week);
  return found ? { week: found.key, label: found.name } : null;
}
