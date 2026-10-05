/**
 * 재입장 요청 만료 정책 및 화면 문구 (클라이언트/서버 공용).
 *
 * 팀장이 오래 응답하지 않을 때의 만료 일수 및 안내 문구.
 */

export const REJOIN_EXPIRED_AFTER_DAYS = 3;

/** 요청자가 볼 만한 상태. `checkRejoinApproval` 과 일치한다. */
export const REJOIN_EXPIRED = "expired" as const;

/** 화면이 말할 안내 문구 — 한 곳에서 관리한다. */
export function rejoinExpiredText(days: number): string {
  return `${days}일 안에 확인되지 않아 요청이 끝났습니다. 다시 요청할 수 있습니다.`;
}
