import { chemistryOf, type Relation } from "./chemistry";
import { PAIRING_COPY, TODAY_COPY, TODAY_TITLE_OTHER, type PairingCopy } from "./copy";
import { dayStemOfDate } from "./today";

/**
 * 사주 놀이의 순수 계산 — 오늘의 궁합 · 사주 맞히기.
 *
 * 둘 다 **서버를 부르지 않는다.** 입력은 오늘 날짜(서버가 정해 넘긴다)와, 팀 사주 화면이 이미 받은
 * 값(일간·오행 수·이름)뿐이다. 그래서 이 놀이는 팀 사주 화면보다 더 많은 것을 알게 하지 않는다.
 *
 * 무작위가 필요한 곳(오늘의 짝 · 맞히기 문제 순서)은 `Math.random()` 이 아니라 **날짜로 정한 순서**다 —
 * 같은 날·같은 사람이면 새로고침해도 같은 문제가 나오고, 어느 기기에서 열어도 같다.
 */

/**
 * 문자열 → 0 이상의 32비트 정수(FNV-1a + 최종 혼합). 암호용이 아니라 순서를 흩는 데만 쓴다.
 *
 * ⚠️ 처음에는 djb2(`h*33 + c`)를 썼는데, **같은 길이의 키끼리는 씨앗이 달라도 순서가 거의 같았다** —
 * 두 해시의 차가 씨앗과 무관해서 순서가 돌아가기만 한다(식별자는 길이가 같으니 정확히 그 경우다).
 * 날짜가 바뀌어도 문제 순서가 그대로면 "오늘의" 가 아니다. 마지막의 혼합(fmix32)이 이를 막는다.
 */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 씨앗으로 정해지는 순서. 같은 씨앗이면 입력 순서와 상관없이 같은 결과(키로 정렬해서 비교한다). */
export function seededOrder<T>(items: readonly T[], seed: string, keyOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    const d = hashString(`${seed}:${ka}`) - hashString(`${seed}:${kb}`);
    return d !== 0 ? d : ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/* ── 오늘의 궁합 ──────────────────────────────────────────── */

/**
 * 오늘의 흐름이 그 사람에게 얼마나 **빠듯하게** 닿는가 — 점수가 아니라 세 갈래다.
 * 오늘의 기운이 나를 다잡는 쪽이면 빠듯하고, 나를 북돋거나 같으면 가볍다.
 */
export type Strain = "light" | "neutral" | "heavy";

const STRAIN: Record<Relation, Strain> = {
  same: "light",
  generatesMe: "light",
  meGenerates: "neutral",
  meControls: "neutral",
  controlsMe: "heavy",
};

export type PairingKind = "start" | "care" | "easy" | "own";

export type TodayPairing = {
  kind: PairingKind;
  copy: PairingCopy;
  /** 각자에게 오늘의 흐름이 어떻게 닿는지 — 홈의 "오늘의 팀플 흐름"과 같은 이름이다(상대 쪽은 3인칭). */
  mine: string;
  theirs: string;
  pairKey: string;
};

export function pairingKindOf(a: Strain, b: Strain): PairingKind {
  if (a === "light" && b === "light") return "start";
  if (a === "heavy" && b === "heavy") return "easy";
  if (a === "heavy" || b === "heavy") return "care";
  return "own";
}

/**
 * 오늘 두 사람이 같이 일하기에 어떤 날인가. 등급이 아니라 **함께 해 볼 행동**을 고른다.
 * 날짜가 아니면 `null`. 순서를 바꿔도 같은 `kind` 가 나온다(대칭).
 */
export function todayPairing(input: { today: string; myStem: number; otherStem: number }): TodayPairing | null {
  const todayStem = dayStemOfDate(input.today);
  if (todayStem === null) return null;
  const mine = chemistryOf(input.myStem, todayStem).relation;
  const theirs = chemistryOf(input.otherStem, todayStem).relation;
  const kind = pairingKindOf(STRAIN[mine], STRAIN[theirs]);
  return {
    kind,
    copy: PAIRING_COPY[kind],
    mine: TODAY_COPY[mine].title,
    theirs: TODAY_TITLE_OTHER[theirs],
    pairKey: chemistryOf(input.myStem, input.otherStem).pairKey,
  };
}

/**
 * 오늘의 짝 — 날짜와 내 번호로 정해지는 한 사람. 같은 날에는 몇 번을 눌러도 같다.
 * 후보가 없으면 `null`.
 */
export function dailyPartner<T extends { id: string }>(others: readonly T[], meId: string, today: string): T | null {
  if (others.length === 0) return null;
  const sorted = [...others].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[hashString(`${today}:${meId}`) % sorted.length]!;
}

/* ── 사주 맞히기 ──────────────────────────────────────────── */

export type GuessRound = {
  targetId: string;
  /** 보기 — 나를 뺀 등록한 팀원 전부, 문제마다 다른 순서. */
  optionIds: string[];
};

/** 한 판의 문제 수 상한. 팀이 작으면 사람 수만큼. */
export const MAX_GUESS_ROUNDS = 5;
/** 맞히기에 필요한 최소 인원(나 포함). 보기가 하나뿐인 문제는 문제가 아니다. */
export const MIN_GUESS_PLAYERS = 3;

/**
 * 오늘의 사주 맞히기 문제. 나를 뺀 등록한 팀원이 둘 미만이면 빈 배열 — 보기가 하나뿐인 문제를 만들지 않는다.
 * 같은 날·같은 사람이면 문제와 보기 순서가 같다.
 */
export function buildGuessRounds(members: readonly { id: string }[], meId: string, today: string): GuessRound[] {
  const others = members.filter((m) => m.id !== meId);
  if (others.length < MIN_GUESS_PLAYERS - 1) return [];
  const targets = seededOrder(others, `${today}:${meId}:targets`, (m) => m.id).slice(0, MAX_GUESS_ROUNDS);
  return targets.map((t) => ({
    targetId: t.id,
    optionIds: seededOrder(others, `${today}:${meId}:${t.id}`, (m) => m.id).map((m) => m.id),
  }));
}
