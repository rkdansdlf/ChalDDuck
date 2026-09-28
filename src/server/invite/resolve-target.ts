import "server-only";

import { db } from "@/server/db";
import { ACTIVE, findInviteByShortCode, findInviteByToken, type Invite } from "./service";

/**
 * 입장에서 "어느 팀"을 정한다 — **초대가 있든 없든.**
 *
 * ## 우선순위가 규칙이다
 *
 * 1. `?t=<토큰>` — 새 링크. `TeamInvite` 한 장.
 * 2. `?code=<짧은 코드>` — `TeamInvite.shortCode`.
 * 3. `?code=<코드>` — **`Team.code` (legacy).** `TeamInvite` 행이 아직 없는 팀을 위한 길.
 *
 * 1·2 는 초대 한 장을 **동시에** 가리킨다. 그래서 `invite` 는 nullable 이다 — 3으로 오는
 * 요청은 `invite: null` 이고, 그때 "이 요청은 초대가 아니라 팀 코드만 보고 왔다"가 그대로
 * 남는다. 나중에 "어떤 공유로 들어왔는지"를 볼 때 이 구분으로 갈린다.
 *
 * ## `?t=` 가 있으면 2·3 으로 **떨어지지 않는다**
 *
 * 초대를 되돌렸을 때(폐기) 링크가 조용히 `Team.code` 길로 넘어가면 안 된다. `?t=` 는
 * **명시적인 권한 증명**이고, 그 증명이 실패했을 때 조용히 다른 자격증으로 물러서는 것은
 * 그 자격증의 실패를 숨기는 일이다. `?t=` 가 오면 토큰 길로만 판정한다.
 *
 * ## 이 함수는 존재 여부를 말해 준다 — 그게 전부다
 *
 * `Team.code` 는 예전부터 공개된 값이라 코드 한 개가 유효한지 말해 주는 oracle 이었다
 * (`joinTeam` 의 `no-code`). 그건 오늘 바꾸지 않는다 — 바꾸려면 팀장 승인 흐름까지 같이
 * 손봐야 하고, 여기서 더 얹으면 실패만 늘어난다. 대신 **찾기가 아니라 읽기가 여기서 끝나고,
 * 순열로 훑는 쪽은 rate limit 대상**이다(`rate-limit/join-throttle.ts`).
 */

export type JoinTarget = {
  teamId: string;
  teamName: string;
  teamCourse: string;
  /**
   * 지금 팀에 있는 사람 수.
   *
   * **코드 길과 같은 값을 돌려줘야 한다.** 01 화면은 "초대받은 팀" 카드에서 이 숫자를 그대로
   * 읽는다(`join-screen.tsx` 의 `users-round` 칩). 초대 링크로 들어올 때 이 값을 세지 않고 넘기면
   * 팀이 비어 있지 않아도 **"0명"** 으로 보인다.
   */
  memberCount: number;
  /** 마감일. 값이 없으면 01 화면에서 칩을 아예 그리지 않는다. */
  teamDday: string | null;
  /**
   * 그 팀의 `Team.code`.
   *
   * **초대 링크로 왔는데도 이 값을 함께 돌려준다.** 온보딩이 아직 `Team.code` 로 팀을 찾고
   * 있으므로, 여기서 비워 버리면 `/join?t=` 로 들어온 사람이 이름 단계에서 막힌다. 초대가
   * 출처를 정해 주는 것이고, 코드는 여전히 그 팀으로 가는 **길**이다 — 둘은 별개다.
   * `Team.code` 를 없애는 마이그레이션이 되면 이 필드도 같이 사라진다.
   */
  teamCode: string;
  /** 이 목표가 초대 한 장으로 왔는가. `Team.code` 로 온 요청은 null. */
  invite: Invite | null;
};

export async function resolveJoinTarget(input: {
  token?: string | null;
  code?: string | null;
}): Promise<JoinTarget | null> {
  // 1. 링크 토큰. **있으면 여기로만 판정한다** — 위 주석의 "떨어지지 않는다".
  const token = input.token?.trim();
  if (token) {
    const invite = await findInviteByToken(token);
    if (!invite) return null;
    return targetOf(await teamRow(invite.teamId), invite);
  }

  const code = input.code?.trim().toUpperCase();
  if (!code) return null;

  // 2. 초대의 짧은 코드.
  const invite = await findInviteByShortCode(code);
  if (invite) return targetOf(await teamRow(invite.teamId), invite);

  // 3. legacy — `Team.code`.
  const team = await teamByCodeRow(code);
  if (!team) return null;
  return targetOf(team, null);
}

async function teamByCodeRow(code: string) {
  const team = await db.team.findUnique({
    where: { code },
    include: { _count: { select: { members: { where: ACTIVE } } } },
  });
  if (!team) return null;
  return team;
}

async function teamRow(teamId: string) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { members: { where: ACTIVE } } } },
  });
  if (!team) throw new Error("초대가 가리키는 팀이 없습니다.");
  return team;
}

function targetOf(
  team: {
    id: string;
    name: string;
    course: string;
    code: string;
    /** `Team.dday` 는 사람이 적는 문자열이다 — `Date` 가 아니다(`schema.prisma`). */
    dday: string | null;
    _count: { members: number };
  },
  invite: Invite | null,
): JoinTarget {
  return {
    teamId: team.id,
    teamName: team.name,
    teamCourse: team.course,
    memberCount: team._count.members,
    teamDday: team.dday,
    teamCode: team.code,
    invite,
  };
}
