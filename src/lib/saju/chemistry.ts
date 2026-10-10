import { ELEMENTS, elementOfStem, type Element } from "./engine";

/**
 * 1:1 케미 — 두 사람의 **일간 오행이 서로 어떤 관계인가**.
 *
 * 입력은 일간(천간 번호) 둘뿐이다. 팀에 공개되는 값이 일간·오행 분포뿐이라서, 상대의 생년월일은
 * 필요하지도 않고 알 수도 없다. 점수로 만들지 않는다 — 어느 관계가 "더 좋다"고 말할 근거가 없다.
 *
 * 오행은 목→화→토→금→수→목 순으로 낳고(상생), 두 칸 건너를 다잡는다(상극). `ELEMENTS` 의 순서가
 * 곧 이 순서라서, 상대 오행 번호에서 내 번호를 뺀 값(mod 5)이 관계를 정한다.
 */

export type Relation =
  /** 오행이 같다. */
  | "same"
  /** 내 오행이 상대 오행을 낳는다(내가 북돋는다). */
  | "meGenerates"
  /** 상대 오행이 내 오행을 낳는다(상대가 북돋는다). */
  | "generatesMe"
  /** 내 오행이 상대 오행을 다잡는다. */
  | "meControls"
  /** 상대 오행이 내 오행을 다잡는다. */
  | "controlsMe";

const RELATION_BY_STEP: readonly Relation[] = ["same", "meGenerates", "meControls", "controlsMe", "generatesMe"];

export type Chemistry = {
  relation: Relation;
  me: Element;
  other: Element;
  /** 일간의 음양이 같은가(갑·병·무·경·임이 양). */
  samePolarity: boolean;
  /** `PAIR_TITLE` 을 찾는 키 — 순서와 무관하다(나×상대 = 상대×나). */
  pairKey: string;
};

const indexOfElement = (e: Element): number => ELEMENTS.indexOf(e);

export function chemistryOf(meStem: number, otherStem: number): Chemistry {
  const me = elementOfStem(meStem);
  const other = elementOfStem(otherStem);
  const a = indexOfElement(me);
  const b = indexOfElement(other);
  const step = (b - a + 5) % 5;
  return {
    relation: RELATION_BY_STEP[step],
    me,
    other,
    samePolarity: meStem % 2 === otherStem % 2,
    pairKey: `${Math.min(a, b)}-${Math.max(a, b)}`,
  };
}
