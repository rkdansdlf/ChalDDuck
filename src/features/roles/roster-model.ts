import type { MbtiType } from "@/lib/mbti";
import type { Member, Role, RoleDrawResult, RoleKey } from "@/lib/types";

/**
 * 역할 조율의 계산 규칙.
 *
 * 07(역할 조율)과 11(홈)이 같은 값을 보여야 하므로 — 홈의 "내 확인이 필요한 일" 건수와
 * 07의 협의 중 역할 수가 어긋나면 안 된다 — 계산을 한 곳에 모은다.
 * 부수 효과 없는 순수 함수라 서버·클라이언트 어디서든 쓸 수 있다.
 */

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
  return roles.filter(
    (role) => wantersOf(members, role.key).length > 1 && !draws[role.key]?.accepted,
  );
}
