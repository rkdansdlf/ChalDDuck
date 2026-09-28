import { ROLES } from "@/data/catalog";
import type { MbtiType } from "@/lib/mbti";
import type { Member, Role, RoleDrawResult, RoleKey } from "@/lib/types";

/**
 * 역할 조율의 계산 규칙.
 *
 * 07(역할 조율)과 11(홈)이 같은 값을 보여야 하므로 — 홈의 "내 확인이 필요한 일" 건수와
 * 07의 협의 중 역할 수가 어긋나면 안 된다 — 계산을 한 곳에 모은다.
 * 부수 효과 없는 순수 함수라 서버·클라이언트 어디서든 쓸 수 있다.
 */

const ROLE_KEY_SET = new Set<string>(ROLES.map((r) => r.key));

/**
 * DB 에 저장된 역할 값을 `RoleKey` 로 읽는다.
 *
 * 스키마가 `String` 이라 형식이 보장되지 않는다(서버 액션은 POST 로 바로 불릴 수 있다).
 * 모르는 값은 `null` 로 떨어뜨려야 규칙이 조용히 틀리지 않는다 — `Veto` 비교도,
 * 역할 이름 찾기도, 알지 못하는 문자열이면 그냥 "선택 안 함"이 맞다.
 */
export function toRoleKey(value: string | null): RoleKey | null {
  return value !== null && ROLE_KEY_SET.has(value) ? (value as RoleKey) : null;
}

/** 서버 액션은 POST 로 바로 불릴 수 있다 — 넘어온 값이 실제 역할인지 여기서 본다. */
export function isRoleKey(value: unknown): value is RoleKey {
  return typeof value === "string" && ROLE_KEY_SET.has(value);
}

/**
 * 이름의 정규형.
 *
 * 이름은 신원이라 조회가 전부 정확해야 한다. 앞뒤 공백은 예전부터 잘랐는데, **유니코드
 * 정규형**이 빠져 있었다. 한글은 분해된 형태(NFD)로 저장되는 곳이 있다 — macOS 파일
 * 이름, 일부 입력기, 복사·붙여넣기. 같은 이름인데 바이트가 달라 조회가 조용히 실패하고
 * 그 사람은 "새 이름"으로 취급되어 같은 팀에 두 줄로 들어갈 수 있다.
 *
 * **대소문자는 접지 않는다.** `Kim` 과 `kim` 을 같게 볼지는 기획에 없다 — 핸드오프 정책표의
 * "동명이인 구분 방법" 행이 미확정이다. 규칙을 지어내지 않는다.
 */
export function normalizeName(value: string): string {
  return value.normalize("NFC").trim();
}

export type MyChoices = {
  name: string;
  mbti: MbtiType | null;
  want: RoleKey | null;
  veto: RoleKey | null;
};

/**
 * 서버 명단 위에 내가 온보딩에서 고른 값을 덮어쓴다.
 *
 * 아직 서버에 보내지 않은 선택이라 명단에는 반영돼 있지 않지만,
 * 화면에서는 내 선택이 이미 반영된 것처럼 보여야 한다.
 */
export function applyMyChoices(roster: Member[], my: MyChoices): Member[] {
  return roster.map((member) =>
    member.isMe
      ? {
          ...member,
          name: my.name.trim() || member.name,
          mbti: my.mbti ?? member.mbti,
          want: my.want ?? member.want,
          veto: my.veto ?? member.veto,
        }
      : member,
  );
}

/** 그 역할을 1순위로 고른 사람들. */
export function wantersOf(members: Member[], role: RoleKey): Member[] {
  return members.filter((m) => m.want === role);
}

/** 추첨 후보가 비었을 때의 이유. 화면은 이걸 보고 왜 안 되는지 보여 준다. */
export type NoDrawPool = "no-wanters" | "all-vetoed";

/**
 * 추첨 후보를 고르는 **규칙.** 서버(`actions/roles`)와 화면(07)이 같은 함수를 쓴다.
 *
 * 두 곳이 따로 적혀 있으면 반드시 어긋난다 — 예전에는 화면 쪽 후보에 Veto 가 빠져
 * 있어서, 연출은 김민준을 돌리면서 서버는 다른 사람을 뽑았다. Veto 로 고른 사람이
 * 그 역할을 뽑히면 "Veto 로 고른 사람은 추첨 대상에서 뺍니다" 라는 화면 문구가
 * 거짓말이 되므로, 후보에서 실제로 빼야 한다.
 *
 * **Veto 는 빠지면 안 되고, 거절은 후보가 비면 무시한다.** Veto 는 지금도 싫다는
 * 뜻이라 다시 뽑아도 마찬가지지만, 거절은 그 한 번의 결과라 남은 사람이 없을 때
 * 증발해 막히는 것보다 되돌려 주는 편이 낫다.
 */
export function drawPoolOf<T extends { id: string; name: string; veto: RoleKey | null }>(
  wanters: T[],
  role: RoleKey,
  rejectedIds: ReadonlySet<string>,
): { pool: T[]; noPool: NoDrawPool | null } {
  const wanted = wanters.filter((m) => m.veto !== role);
  if (wanted.length === 0) {
    return { pool: [], noPool: wanters.length === 0 ? "no-wanters" : "all-vetoed" };
  }
  const remaining = wanted.filter((m) => !rejectedIds.has(m.id));
  return { pool: remaining.length > 0 ? remaining : wanted, noPool: null };
}

/** 후보가 비었을 때 화면에 보여 줄 문구. */
export const NO_DRAW_POOL_TEXT: Record<NoDrawPool, string> = {
  "no-wanters": "이 역할을 1순위로 고른 팀원이 없습니다",
  "all-vetoed": "이 역할을 1순위로 고른 사람이 모두 피할 일로 골랐습니다 — 추첨할 수 없습니다",
};

/** 화면(`roster-screen`)이 그리는 데 필요한 추첨 정보는 `RoleDrawResult` 다 — 하나만 쓴다. */

/**
 * 역할 하나가 지금 **무슨 상태인지** 정하는 규칙.
 *
 * **왜 함수여야 하는가.** 예전에는 07 화면이 상태마다 조건을 직접 적었고, 조건 하나가
 * `clash`(희망자 2명 이상)에 묶여 있었다. 그래서 두 가지가 고장 났다 —
 *
 * - 희망자가 1명인 역할에 남은 추첨은 **당첨자도 아무것도 볼 수 없었다.** 답을 받을
 *   칸 자체가 조건 아래에 있어서였다. 서버는 막지 않는다 — `drawForRole` 은 희망자 수를
 *   보지 않는다.
 * - 당첨자가 팀을 나간 추첨은 **누구도 풀 수 없는 상태로 남았다.** 나간 사람의 세션은
 *   지워지고(`session.ts`), 남은 팀원은 당첨자가 본인이 아니라 거절당하며, 다시 뽑는
 *   길은 "이미 결과가 있습니다" 에 막힌다. 영원히 "수락 대기" 에 멈춘다.
 *
 * 상태는 `result`(추첨 결과) 로 갈라야 한다 — `clash` 로가 아니다. 추첨이 있으면 결과가
 * 있고, 결과가 있으면 그걸 볼 사람이 반드시 있어야 한다.
 */
export type RoleView =
  /** 아무도 1순위로 안 골랐다. */
  | { kind: "empty" }
  /** 희망자 1명, 추첨 없음 — 뽑을 것이 없으므로 곧바로 확정된다. */
  | { kind: "auto" }
  /** 희망자 2명 이상, 아직 추첨 전 — 이야기하거나 뽑아야 한다. */
  | { kind: "negotiating" }
  /** 추첨 결과가 났고 아직 수락 전. */
  | { kind: "awaiting"; winner: string }
  /** 확정. */
  | { kind: "confirmed"; winner: string }
  /** 당첨자가 팀을 나갔다 — 무효. 다시 뽑을 수 있다. */
  | { kind: "voided"; winner: string };

export function roleViewOf(wanterCount: number, draw: RoleDrawResult | null): RoleView {
  // **추첨 결과가 있으면 희망자 수보다 먼저 본다.** 결과가 남아 있는데 화면이 "미정"
  // 이나 "확정 예정" 으로 덮으면, 그 결과는 보이지도 풀 수도 없다 — 당첨자가 자기
  // 1순위를 바꾼 뒤 남아 있는 추첨이 정확히 그렇다. 희망자 수는 **추적이 없을 때만**
  // 기준이 된다.
  if (draw) {
    // **확정이 무효보다 먼저다.** 확정된 추첨의 당첨자가 나간 뒤에도 배정은 이미 끝난
    // 사실이다 — 무효로 처리해 "다시 추첨하기" 를 열어 두면, 눌렀을 때 확정된 배정을
    // 지우고 새 추첨으로 덮어쓴다. 담당자가 누구였는지도 이력에서 사라진다.
    if (draw.accepted) return { kind: "confirmed", winner: draw.winner };
    if (draw.stale) return { kind: "voided", winner: draw.winner };
    return { kind: "awaiting", winner: draw.winner };
  }

  if (wanterCount === 0) return { kind: "empty" };
  return wanterCount > 1 ? { kind: "negotiating" } : { kind: "auto" };
}

/**
 * 이 상태에서 추첨 버튼을 띄워야 하는가.
 *
 * `voided` 가 여기에 핵심이다 — 무효 추첨은 **자리를 차지하고 있으므로** 다시 뽑는 길이
 * 있어야 한다. 예전에는 `negotiating` 일 때만 보여서, 갇힌 추첨을 꺼낼 수단이 없었다.
 */
export function canDrawIn(view: RoleView): boolean {
  return view.kind === "negotiating" || view.kind === "voided";
}

/** 무효가 된 이유를 화면에 말해 준다. */
export function voidedText(winner: string): string {
  return `${winner}님이 팀을 떠났다 — 이 추첨은 아무도 수락할 수 없어 무효입니다`;
}

/**
 * 겹쳤다고 볼지 정하는 **한 가지 규칙.**
 *
 * 명단을 들고 있는 화면(07)과 숫자만 세는 곳(탭 배지)이 같은 판단을 해야 한다 —
 * 한쪽이 "겹침 2건"인데 다른 쪽이 1건이면 어느 쪽을 믿어야 할지 알 수 없다.
 */
export function isUnresolvedClash(wanterCount: number, accepted: boolean): boolean {
  return wanterCount > 1 && !accepted;
}

/**
 * 아직 확정되지 않은, 희망자가 겹친 역할들.
 *
 * 두 사람 이상이 같은 역할을 1순위로 골랐고 당사자 수락까지 끝나지 않은 것만 센다.
 */
export function unresolvedClashes(
  roles: Role[],
  members: Member[],
  draws: Partial<Record<RoleKey, RoleDrawResult>>,
): Role[] {
  return roles.filter((role) =>
    isUnresolvedClash(wantersOf(members, role.key).length, draws[role.key]?.accepted ?? false),
  );
}
