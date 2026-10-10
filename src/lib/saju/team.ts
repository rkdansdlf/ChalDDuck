import { ELEMENTS, type Element } from "./engine";

/**
 * 팀 사주 — 등록한 팀원들의 오행 글자 수를 **더한 것**.
 *
 * 더하기와 "가장 많다/가장 적다"만 한다. 그 결과에서 팀이 어떻다고 서술하지 않는다 — 이 숫자는
 * 사람이 낸 생년월일의 합이지 팀이 일하는 방식을 잰 값이 아니다(`team-mbti.tsx` 가 같은 이유로
 * `dominantSummary` 를 지웠다). 화면은 "가장 적게 센 오행의 키워드를 챙겨 보자"는 **제안**만 한다.
 */

export type TeamSajuSummary = {
  /** 센 사람 수. */
  members: number;
  /** 센 글자 수 = 사람 수 × 6. */
  characters: number;
  counts: Record<Element, number>;
  /** 비율(%). 합이 정확히 100 — 사람이 없으면 모두 0. */
  percent: Record<Element, number>;
  /** 가장 많이 센 오행(동률이면 모두). */
  dominant: Element[];
  /**
   * 가장 적게 센 오행(동률이면 모두). **다섯이 모두 같으면 비어 있다** — 두드러지는 것이 없는데
   * 억지로 하나를 고르면 임의의 선택이 된다.
   */
  lowest: Element[];
};

export function summarizeTeam(list: { elements: Record<Element, number> }[]): TeamSajuSummary {
  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 } as Record<Element, number>;
  for (const m of list) for (const e of ELEMENTS) counts[e] += m.elements[e];
  const characters = ELEMENTS.reduce((a, e) => a + counts[e], 0);

  const raw = ELEMENTS.map((e) => (characters === 0 ? 0 : (counts[e] / characters) * 100));
  const floors = raw.map(Math.floor);
  let left = characters === 0 ? 0 : 100 - floors.reduce((a, b) => a + b, 0);
  raw
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i)
    .forEach(({ i }) => {
      if (left > 0) {
        floors[i] += 1;
        left -= 1;
      }
    });
  const percent = {} as Record<Element, number>;
  ELEMENTS.forEach((e, i) => {
    percent[e] = floors[i];
  });

  const max = Math.max(...ELEMENTS.map((e) => counts[e]));
  const min = Math.min(...ELEMENTS.map((e) => counts[e]));
  return {
    members: list.length,
    characters,
    counts,
    percent,
    dominant: characters === 0 ? [] : ELEMENTS.filter((e) => counts[e] === max),
    lowest: characters === 0 || max === min ? [] : ELEMENTS.filter((e) => counts[e] === min),
  };
}
