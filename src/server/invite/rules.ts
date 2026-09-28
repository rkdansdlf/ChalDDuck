/**
 * 초대의 사용 가능 여부를 **순수하게** 판정한다.
 *
 * db 를 만지지 않으므로 `scripts/smoke.mts` 가 서버 액션 없이도 부를 수 있다
 * (`rate-limit/policy.ts` 와 같은 이유 — 판정을 함수로 빼두는 것이 테스트 가능성의 전제다).
 */

/** DB 에서 읽어 온 초대의 판정에 필요한 칸. */
export type InviteState = {
  maxUses: number | null;
  useCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

/**
 * 이 초대가 지금 들어오는 길을 열어 주는가.
 *
 * 세 가지를 본다 — 되돌렸나, 만료됐나, 자리가 찼나. **셋 중 하나만 있어도 막는다.**
 *
 * ## `useCount` 는 승인 기준이다
 *
 * **거절과 취소를 세지 않는다.** 거절된 사람은 아무 자리도 쓰지 않았다. 세면 "1회용" 초대가
 * 실패 한 번으로 닫혀 버려, 팀장이 거절하는 것만으로 팀원이 못 들어오게 된다.
 *
 * ## 경계는 닫힌 쪽이다
 *
 * `expiresAt` 과 `expiresAt` 이 **같은** 순간은 이미 만료다. 비교는 `<=` 다 — "그 시각까지
 * 유효"가 아니라 "그 시각부터 무효"로 읽어서, 정확히 그 순간에 도착한 사람이행운에 따라
 * 들어갈 수 없게 하지 않는다.
 */
export function isInviteUsable(invite: InviteState, now = Date.now()): boolean {
  if (invite.revokedAt) return false;
  if (invite.expiresAt && invite.expiresAt.getTime() <= now) return false;
  if (invite.maxUses !== null && invite.useCount >= invite.maxUses) return false;
  return true;
}
