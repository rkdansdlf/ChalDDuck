/**
 * 가입 요청 제한의 **순수 정책.**
 *
 * db 를 만지지 않고 판단만 한다 — 그러면 `scripts/smoke.mts` 가 서버 액션 없이도 이 규칙을
 * 그대로 부를 수 있다. 서버 액션은 전부 쿠키가 필요해서(스모크 파일 머리말 참조) 부르면
 * "액션이 정상"이 아니라 "액션을 우회했다"는 사실만 테스트하게 된다. **판정을 함수로
 * 빼는 이유가 이것이다.**
 *
 * 숫자보다 중요한 것은 **세 제한의 목적을 섞지 않는 것**이다:
 * - `client`   — 빠른 반복. 이 브라우저가 유독 많이 찍는 것.
 * - `teamCreate` — **쿠키 우회** 방어. 쿠키는 지우면 새로 받으므로 client 만으로는 멈추지 않는다.
 * - `teamPush` — 비용. 알림 행은 남겨도 **푸시만** 막는다. 앱 안 알림함이 있으면 팀장이
 *   나중에 볼 수 있기 때문에, 푸시만 빠뜨리는 것이 요청 자체를 막는 것보다 낫다.
 *
 * `teamCreate` 를 `client` 와 같은 값으로 두면 DoS 가 된다 — 일부러 한도를 소진시킨
 * 공략자가 정상 팀원의 가입까지 막아 버리는 경로다. 그래서 팀 예산을 넉넉히 둔다.
 */

export type Window = {
  /** 이 창에서 몇 번까지 허용한다. */
  max: number;
  windowMs: number;
};

export const MINUTE = 60 * 1000;

export const JOIN_LIMIT = {
  /** 1. 이 브라우저 기준. 누군가 자기 코드로 계속 찍는 것을 먼저 멈춘다. */
  client: {
    short: { max: 5, windowMs: 10 * MINUTE },
    long: { max: 15, windowMs: 60 * MINUTE },
  },
  /** 2. 팀이 **새로 만드는** 요청 수. 쿠키를 지워도 여기서는 막힌다. */
  teamCreate: {
    short: { max: 20, windowMs: 10 * MINUTE },
    long: { max: 50, windowMs: 60 * MINUTE },
  },
  /** 3. 팀장에게 나가는 **푸시**. 앱 안 알림은 그대로 둔다. */
  teamPush: {
    burst: { max: 5, windowMs: 1 * MINUTE },
    short: { max: 15, windowMs: 10 * MINUTE },
  },
  /**
   * 팀에 쌓여 있는 미해결 요청(승인 대기 + 승인되었지만 아직 회수되지 않음)의 상한.
   *
   * 시간 제한만 두면 **느린 공격**이 남아 있다 — 매시간 한창씩 조금씩 신청해 두면
   * 24시간 뒤에 수백 건이 쌓이고, 그건 이미 시간 한도를 안 넘긴 요청이다. 그래서 개수
   * 상한을 같이 둔다.
   */
  unresolvedPerTeam: 50,
} as const;

/**
 * 어디서 막혔는가. 팀장 화면 문구와 요청자가 받는 안내가 이걸로 갈린다.
 *
 * `client` — 이 브라우저가 너무 많이 물어봤다.
 * `team-budget` — 이 팀이 초대 요청을 너무 많이 받았다(쿠키 우회로 온 것까지).
 * `pending-cap` — 팀에 이미 처리되지 않은 요청이 너무 쌓여 있다.
 */
export type JoinGate = "open" | "client" | "team-budget" | "pending-cap";

/**
 * 1단계 — 이 브라우저 제한.
 *
 * **비교는 `>` 다.** 지금 막은 시도까지 이미 창에 찍혔으므로(`hitWindow` 가 새 값을 준다)
 * `max` 번까지는 통과하고 `max + 1`번째에서 막힌다. `>=` 로 쓰면 한 번 일찍 막힌다.
 */
export function clientGate(clientShort: number, clientLong: number): JoinGate {
  if (clientShort > JOIN_LIMIT.client.short.max) return "client";
  if (clientLong > JOIN_LIMIT.client.long.max) return "client";
  return "open";
}

/**
 * 2·4단계 — 팀 예산과 미해결 요청 상한.
 *
 * 이 판정이 **실제로 새 요청을 만들 수 있을 때**에만 불린다. 같은 이름의 요청을 다시 내거나
 * 남의 요청에 부딪힌 경우에는 여기에도 오지 않는다 — 그래야 정상 사용자가 재시도하는 것으로
 * 팀 예산이 깎이지 않는다.
 */
export function teamGate(teamShort: number, teamLong: number, unresolved: number): JoinGate {
  if (teamShort > JOIN_LIMIT.teamCreate.short.max) return "team-budget";
  if (teamLong > JOIN_LIMIT.teamCreate.long.max) return "team-budget";
  if (unresolved >= JOIN_LIMIT.unresolvedPerTeam) return "pending-cap";
  return "open";
}

/** 팀장 화면에 경고를 띄워야 하는 상태인가. */
export function isJoinCapped(unresolved: number): boolean {
  return unresolved >= JOIN_LIMIT.unresolvedPerTeam;
}
