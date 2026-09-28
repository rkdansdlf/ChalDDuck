/**
 * 정정(의견 차이)의 규칙 — **한 곳에서만 정한다.**
 *
 * 화면(23)과 서버 액션이 같은 값을 쓰고, 기록 상태 계산(`server/contrib/state.ts`)도
 * "정리되었는가" 를 이 모듈이 정한 값으로 본다. 각자 판단하면 세 군데가 어긋난다 —
 * 화면은 "정리됐다"고 하고 리포트는 "의견 차이"로 세는 일이 실제로 있었다.
 *
 * **지우지 않는다.** 의견도 결론도 그대로 남고(스키마 주석), 아래 규칙은 그 위에서
 * "지금 무엇이 가능한가"만 정한다.
 */

/**
 * 정정의 결론 세 가지.
 *
 * **세 번째 길이 필요한 이유**: 앞의 둘(정정 동의 · 공동 작업) 중 어느 쪽으로도 합의가
 * 안 되면 기록이 `disputed` 로 영영 남았다 — 17 화면의 확인 버튼이 사라지고(확인 조건이
 * "의견이 없음"), 리포트에 "의견 차이"로만 세어졌다. 기한도 자동 마감도 없으니 팀이 문서를
 * 낼 수 있게 닫는 길이 필요했다.
 *
 * **화면은 키를 보내고, 표에는 문구가 들어간다.** 키를 보내게 해야 서버가 집합 밖의 말을
 * 거를 수 있다 — 문구를 보내게 하면 "합의 없음"처럼 보이는 임의의 문장이 저장되고, 리포트의
 * 집계(`unresolvedAfter`)가 한국어 문장을 읽어야 한다.
 */
export const RESOLUTION_WAYS = {
  /** 상대가 적은 의견이 맞다 — 기록은 그 내용으로 고쳐 읽는다(본문은 그대로, 결론만 남는다). */
  accept: "정정 동의 · 의견대로 수정",
  /** 둘이 한 일이다. */
  split: "공동 작업으로 나눔",
  /**
   * **답이 없었던** 기록은 원문 그대로 두고 절차만 닫는다.
   *
   * 한쪽 말로 덮지 않는다는 원칙은 깨지지 않는다 — 양쪽 의견이 이력에 그대로 남고, 리포트에
   * "정리되지 않은 의견 N건"으로 남는다. 닫힌 뒤에도 누구든 다시 의견을 남길 수 있으니
   * "합의"도 마지막이 아니다(서버 액션).
   */
  noAgreement: "합의 없음 · 원문 유지",
} as const;

export type ResolutionWay = keyof typeof RESOLUTION_WAYS;

/** 서버가 받아들이는 결론인가. 화면이 보낸 문자열을 그대로 쓰지 않는다. */
export function isResolutionWay(value: unknown): value is ResolutionWay {
  return typeof value === "string" && Object.hasOwn(RESOLUTION_WAYS, value);
}

/** 정정의 결론을 사람이 읽는 문장으로. 모르는 값이면 값 자체를 말한다(숨기지 않는다). */
export function resolutionText(way: string | null | undefined): string | null {
  if (!way) return null;
  return Object.values(RESOLUTION_WAYS as Record<string, string>).includes(way)
    ? way
    : `${way} (기록에 남은 값)`;
}

/**
 * 의견이 **답해지지 않고 닫힌** 상태인가 — 리포트가 "정리되지 않은 의견"으로 세는 것.
 *
 * 의견이 있고(아직 지워지지 않았습니다) + 결론이 "합의 없음"인 경우. "정정 동의"나
 * "공동 작업"으로 닫힌 것은 해결된 것이므로 세지 않는다.
 */
export function unresolvedAfter(record: {
  dispute: string | null;
  resolution: string | null;
}): boolean {
  return Boolean(record.dispute) && record.resolution === RESOLUTION_WAYS.noAgreement;
}

/**
 * 이 사람이 그 기록을 **확인할 수 있는가**.
 *
 * 규칙이 세 개다.
 * - **자기 기록은 안 된다.** 본인 말만으로 확정되면 기록이 근거가 되지 못한다.
 * - **반대한 사람은 안 된다.** 자기 반대를 스스로 "확인함"으로 바꾸는 셈이다. 결론이
 *   "정정 동의"로 이미 바뀌었어도 마찬가지입니다 — 반대가 표에 남아 있는 한 그대로입니다.
 * - 그 외에는 된다.
 *
 * 화면이 숨기는 것과 서버가 거절하는 것이 **같은 함수**여야 합니다 — 주소를 알면 화면을
 * 거치지 않고 들어올 수 있기 때문입니다.
 */
export function canConfirm(input: {
  /** 기록 주인. */
  memberId: string;
  /** 지금 의견을 적은 사람. 지워지지 않으므로 오래된 반대가기도 하다. */
  disputedById: string | null;
  meId: string;
}): boolean {
  if (input.meId === input.memberId) return false;
  if (input.disputedById === input.meId) return false;
  return true;
}

/** 확인이 막혔을 때 화면이 말할 이유. */
export function confirmBlockReason(input: {
  memberId: string;
  disputedById: string | null;
  meId: string;
  who?: string;
}): string | null {
  if (input.meId === input.memberId) return "자기 기록은 확인할 수 없습니다";
  if (input.disputedById === input.meId) {
    return `${input.who ?? "이 의견"}은 내가 적은 의견입니다 — 같은 기록에 확인을 남길 수 없습니다`;
  }
  return null;
}
