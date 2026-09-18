/** MBTI 4축과 16유형 — 온보딩 03·04 화면이 공유하는 정의. */

export const MBTI_AXES = ["EI", "SN", "TF", "JP"] as const;
export type MbtiAxis = (typeof MBTI_AXES)[number];

/** 4×4 그리드 배열 그대로. 03 화면의 표시 순서이기도 하다. */
export const MBTI_GRID = [
  ["ISTJ", "ISFJ", "INFJ", "INTJ"],
  ["ISTP", "ISFP", "INFP", "INTP"],
  ["ESTP", "ESFP", "ENFP", "ENTP"],
  ["ESTJ", "ESFJ", "ENFJ", "ENTJ"],
] as const;

export const MBTI_TYPES = MBTI_GRID.flat();
export type MbtiType = (typeof MBTI_TYPES)[number];

export function isMbtiType(value: unknown): value is MbtiType {
  return typeof value === "string" && (MBTI_TYPES as readonly string[]).includes(value);
}

/** 30초 컷의 한 문항 선택 — `a` 는 각 축의 앞 글자, `b` 는 뒷 글자. */
export type QuizPick = "a" | "b" | null;
export type QuizPicks = [QuizPick, QuizPick, QuizPick, QuizPick];

export const EMPTY_PICKS: QuizPicks = [null, null, null, null];

/**
 * 4문항 답을 유형으로 환산한다. 한 문항이라도 비어 있으면 `null`.
 *
 * ⚠️ 이건 정식 MBTI 검사가 아니라 **간편 선택**이다. 정확도·검증 결과는
 * 기획안에 없으므로 화면에서 "진단"이라는 말을 쓰지 않는다.
 */
export function picksToMbti(picks: QuizPicks): MbtiType | null {
  if (picks.some((p) => p === null)) return null;
  const type = MBTI_AXES.map((axis, i) => (picks[i] === "a" ? axis[0] : axis[1])).join("");
  return isMbtiType(type) ? type : null;
}

/** 캐릭터 이미지 경로 — 16종은 `public/assets/characters/` 에 유형명으로 들어 있다. */
export function characterImage(mbti: MbtiType): string {
  return `/assets/characters/${mbti}.png`;
}
