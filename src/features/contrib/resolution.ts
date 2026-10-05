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

/**
 * 이력이 "철회"라는 것을 알리는 한 줄 — 2026-10-03 결정.
 *
 * ## 왜 지우지 않고 한 줄을 남기는가
 *
 * 반대도 지우지 않는다. **철회까지 지우면 그건 의견이 아니라 지워진 것이 된다** — "이 사람이
 * 한 말이었다가 되돌렸다"와 "이 사람이 한 말이 없다"는 팀 입장에서 전혀 다른 사실이다. 그래서
 * 철회도 이력에 남기고 **현재 떠 있는 의견**만 비운다.
 *
 * ## 왜 사람이 쓴 문장이 아니라 **고정된 값**인가
 *
 * 이 줄을 사람이 쓴 의견과 구분할 수 있어야 한다. 사람이 "철회"라고 적은 것과 이 상수가
 * 적힌 것은 **다른 사실**이다 — 전자는 사람이 그 말을 한 것이고, 후자는 시스템이 남긴 것이다.
 * 그래서 철회 문구는 여기로 고정하고 **클라이언트가 이 값을 그대로 보낼 수 없다** — 서버는
 * 이 상수로 적는다.
 */
export const WITHDRAWN_DISPUTE = "이 사람은 이 기회를 정정하는 것이 아니라, 남긴 반대를 철회했습니다.";

/** 이력이 철회인지 — 화면이 그 줄을 다르게 말할 때 쓴다. */
export function isWithdrawnDispute(text: string): boolean {
  return text === WITHDRAWN_DISPUTE;
}

/**
 * 이 사람이 **지금 떠 있는 반대를 철회할 수 있는가.**
 *
 * **적을 수 있는 사람과 철회할 수 있는 사람은 다르다.** 반대를 적을 수 있는 사람은 기록의
 * 주인이 아니고, 정리를 함께 하는 사람은 **주인이기도 하다**. 철회는 자기 생각을 거두는
 * 행위이므로 **남긴 사람만** 할 수 있다 — 주인이 대신 철회하면 그건 철회가 아니라 정리다.
 */
export function canWithdrawDispute(input: { disputedById: string | null; meId: string }): boolean {
  return input.disputedById !== null && input.disputedById === input.meId;
}
