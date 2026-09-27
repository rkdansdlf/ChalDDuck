/**
 * AI 도구가 받는 사용자 입력의 길이 상한.
 *
 * 서버(`server/ai/model.ts` 의 `clampInput`)와 화면이 **같은 값을 써야 한다.** 서버만
 * 알고 있으면 자른 사실을 알 수 없고, 화면만 알면 거짓말을 하게 된다 — 예전에는 서버가
 * 8000자에서 잘랐는데 화면에는 아무 표시가 없었다. 그래서 회의 메모의 절반이 빠진 요약이
 * "AI 초안" 배지 아래 멀쩡하게 놓였고, 읽은 사람은 그것이 전부라고 믿었다.
 *
 * 팀플 회의 메모 기준이라는 값은 그대로다. 값을 정한 근거는 기획안에 없다 — 더 들어오는
 * 사람이 판단하면 된다.
 */
export const AI_INPUT_LIMIT = 8000;

/** 위에서부터 얼마나 잘렸는지(글자 수). 잘리지 않으면 0. */
export function aiInputOverrun(text: string): number {
  return Math.max(0, text.length - AI_INPUT_LIMIT);
}
