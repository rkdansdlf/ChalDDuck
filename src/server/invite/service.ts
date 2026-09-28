import "server-only";

import { db } from "@/server/db";
import { hashInviteToken, looksLikeInviteToken, newInviteToken } from "@/server/auth/invite-token";
import { isInviteUsable, type InviteState } from "./rules";

/** 지금 팀에 있는 사람만 센다 — 나간 사람의 `Member` 행은 기록을 위해 남는다. */
export const ACTIVE = { leftAt: null } as const;

/**
 * 초대 발급과 해석.
 *
 * **`Team.code` 로 팀을 찾는 길은 여기 없다.** 그건 `invite/resolve-target.ts` 가
 * legacy 로 붙여 준다. 여기 있는 것만으로는 "팀 하나"가 아니라 "초대 한 장"이 나온다 —
 * 목표가 팀인지 초대인지 구분하지 않기 위해서다.
 *
 * **사용 가능 여부는 해석할 때마다 다시 본다.** 발급 시점에 한 번만 보면, 그 뒤에 만료되거나
 * 자리가 찬 초대가 계속 통과한다. 승인 때 자리가 차는 것은 A4 다.
 */

/**
 * DB 에서 읽어 온 초대. 쓰기 대상이 아니라 판정 대상이다.
 *
 * 판정(`isInviteUsable`)은 `invite/rules.ts` 에 있다 — 순수해야 테스트할 수 있으므로.
 * 여기서는 **찾는 것**만 한다.
 */
export type Invite = InviteState & {
  id: string;
  teamId: string;
  shortCode: string | null;
  label: string | null;
};

const INVITE_COLUMNS = {
  id: true,
  teamId: true,
  shortCode: true,
  label: true,
  maxUses: true,
  useCount: true,
  expiresAt: true,
  revokedAt: true,
} as const;

/**
 * 초대 한 장을 발급한다. **원문 토큰은 이 호출에서 한 번만 나온다.**
 *
 * 나중에 다시 못 본다 — 해시만 남으므로, 화면에 한 번 보여 주고 잃어버리면 새로 만들어야
 * 한다. 재입장 코드(`auth/issue.ts`)와 같은 타협이다.
 */
export async function createTeamInvite(
  teamId: string,
  options: {
    maxUses?: number | null;
    expiresAt?: Date | null;
    shortCode?: string | null;
    label?: string | null;
  } = {},
): Promise<{ invite: Invite; token: string }> {
  const token = newInviteToken();
  const invite = await db.teamInvite.create({
    data: {
      teamId,
      tokenHash: hashInviteToken(token),
      shortCode: options.shortCode ?? null,
      label: options.label ?? null,
      maxUses: options.maxUses ?? null,
      expiresAt: options.expiresAt ?? null,
    },
    select: INVITE_COLUMNS,
  });
  return { invite, token };
}

/**
 * 링크 토큰으로 초대를 찾는다. **없거나 못 쓰는 것이면 null.**
 *
 * 못 쓴 초대를 `null` 로 뭉개는 것이 deliberate 다 — 호출부가 "왜 안 됐는지"를 분기할 필요를
 * 갖지 않게 하고, 그 정보가 밖으로 새는 일도 없다.
 */
export async function findInviteByToken(rawToken: string): Promise<Invite | null> {
  // 조회를 두드리기 전에 형태를 본다 — `/join?t=` 는 인증 없는 공개 경로다.
  if (!looksLikeInviteToken(rawToken)) return null;

  const invite = await db.teamInvite.findUnique({
    where: { tokenHash: hashInviteToken(rawToken) },
    select: INVITE_COLUMNS,
  });
  if (!invite || !isInviteUsable(invite)) return null;
  return invite;
}

/** 사람이 직접 옮겨 적은 짧은 코드로 초대를 찾는다. */
export async function findInviteByShortCode(code: string): Promise<Invite | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const invite = await db.teamInvite.findUnique({
    where: { shortCode: normalized },
    select: INVITE_COLUMNS,
  });
  if (!invite || !isInviteUsable(invite)) return null;
  return invite;
}

/**
 * 팀장용: 그 팀의 초대들을 연다. **되돌린 것도 보여 준다** — 지웠다가 안 보이는 것보다
 * "이건 내가 껐어" 가 사실이고, 언제 만료되는지도 같이 보여 줘야 판단할 수 있다.
 */
export async function listTeamInvites(teamId: string): Promise<Invite[]> {
  return db.teamInvite.findMany({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    select: INVITE_COLUMNS,
  });
}

/**
 * 되돌린다. **삭제하지 않는다.**
 *
 * 이 행이 "이 팀이 언제 누구에게 나눠 줬는가"의 기록이라, 지우면 되돌렸던 초대를 다시
 * 되돌릴 수 없게 된다(원문 토큰도 이미 없으므로). 되돌린 뒤에도 목록에 남고, 이 길로는 더
 * 이상 아무도 들어오지 못한다.
 */
export async function revokeTeamInvite(inviteId: string, teamId: string): Promise<boolean> {
  const { count } = await db.teamInvite.updateMany({
    where: { id: inviteId, teamId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count > 0;
}
