import { chemistryOf, type Relation } from "./chemistry";
import { dayPillarOf, isRealDate, pillarHanja, pillarKo } from "./engine";
import { MEETING_TIP, MISSION_DUE_SOON, MISSION_MEETING_CLOSER, TODAY_COPY } from "./copy";
import { summarizeTeam } from "./team";
import type { Element } from "./engine";

/**
 * 홈의 "오늘의 팀플 흐름" — **오늘 날짜**와 **지금 팀 상태**로 만드는 고정 문구.
 *
 * ## 이 파일이 하는 일
 *
 * - 오늘 날짜의 일간(일진)을 구하고, 내 일간과의 오행 관계로 한 줄을 고른다.
 * - 팀 상태(오늘 회의 · 마감 임박)에 따라 **오늘의 팀 미션**을 붙인다.
 *
 * ## 홈이 AI 를 부르지 않는 이유와 같다
 *
 * 홈은 가장 자주 보는 화면이고 이 카드는 **누르지 않아도** 나온다(`briefing.ts` 가 같은 이유로
 * 모델을 부르지 않는다). 그래서 날짜와 숫자만으로 정해지는 결정적 함수다 — 같은 날·같은 상태면
 * 누가 언제 열어도 같은 말이 나온다.
 *
 * **`today` 는 서버가 넘긴다.** 이 함수는 `new Date()` 를 부르지 않는다 — 기기 시계로 "오늘"을
 * 맞추면 사람마다 다른 하루를 본다.
 *
 * ## 이 카드가 말하지 않는 것
 *
 * 등급("GOOD")이나 점수가 없다. 관계의 이름과 해 볼 행동만 있다. 팀 미션도 "누가 맡아라"가 아니라
 * 회의를 어떻게 진행해 볼지에 한정한다(역할은 사주로 정하지 않는다).
 */

/** `YYYY-MM-DD`(한국 날짜)의 일진 천간. 날짜가 아니면 `null`. 달력 날짜로 센다(자정에 바뀐다). */
export function dayStemOfDate(today: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isRealDate(y, mo, d) ? dayPillarOf(y, mo, d).stem : null;
}

export type TodayFlow = {
  /** 오늘의 일진 — "병술". */
  pillarKo: string;
  /** "丙戌". */
  pillarHanja: string;
  relation: Relation;
  title: string;
  line: string;
  tip: string;
  /** 오늘의 팀 미션. 없으면 빈 배열(만들어 내지 않는다). 최대 둘 — 위 `overlap` 규칙. */
  missions: string[];
};

export function buildTodayFlow(input: {
  /** 한국 날짜(`YYYY-MM-DD`). 서버가 정한다. */
  today: string;
  /** 내 일간 천간 번호. */
  myStem: number;
  /** 등록한 팀원들의 연·월·일 오행 수(나 포함). 가장 적게 센 오행의 회의 제안에 쓴다. */
  team: { elements: Record<Element, number> }[];
  /** 오늘 확정된 회의가 있는가 — `briefing.ts` 가 센 결과를 그대로 받는다. */
  meetingToday: boolean;
  /** 마감이 임박한 업무가 있는가 — 마찬가지로 `briefing.ts` 의 결과. */
  dueSoon: boolean;
}): TodayFlow | null {
  const todayStem = dayStemOfDate(input.today);
  if (todayStem === null) return null;

  const [y, mo, d] = input.today.split("-").map(Number);
  const pillar = dayPillarOf(y!, mo!, d!);
  const { relation } = chemistryOf(input.myStem, todayStem);
  const copy = TODAY_COPY[relation];

  // 미션은 최대 둘이다. 회의와 마감이 겹치면 셋이 되는데, 이때는 **팀 분포에서 고른 제안**을 뺀다 —
  // 회의 마무리 확인과 마감 확인은 오늘 실제 상태에서 나온 것이고, 분포 제안은 참고용이기 때문이다.
  const missions: string[] = [];
  // 두 명 이상이 등록했을 때만 팀 분포를 쓴다 — 한 명의 오행을 "팀"이라 부르지 않는다.
  const lowest = input.team.length >= 2 ? summarizeTeam(input.team).lowest[0] : undefined;
  const tip = input.meetingToday && lowest ? MEETING_TIP[lowest] : null;
  const overlap = input.meetingToday && input.dueSoon;
  if (tip && !overlap) missions.push(tip);
  if (input.meetingToday) missions.push(MISSION_MEETING_CLOSER);
  if (input.dueSoon) missions.push(MISSION_DUE_SOON);

  return {
    pillarKo: pillarKo(pillar),
    pillarHanja: pillarHanja(pillar),
    relation,
    title: copy.title,
    line: copy.line,
    tip: copy.tip,
    missions,
  };
}
