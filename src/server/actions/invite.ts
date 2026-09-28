"use server";

import { revalidatePath } from "next/cache";
import { createTeamInvite, revokeTeamInvite } from "@/server/invite/service";
import { requireLeader } from "@/server/session";

/**
 * 팀장이 **공유 한 번**을 하는 자리.
 *
 * ## 왜 화면이 아니라 액션이냐
 *
 * 여기서 만드는 것의 본질이 "이 팀에 들어올 수 있는 권리를 하나 더 만드는 것"이라서다.
 * `Team.code` 하나로는 그걸 할 수 없었는데 — 그래서 코드가 팀 전체의 공유가 되었고, 되돌릴
 * 방법이 없었다. 초대 한 장을 만들면 **그 공유 하나만** 골라 되돌릴 수 있다.
 *
 * 팀장만 한다. `requireLeader()` 를 액션 맨 앞에서 부르고, 그 뒤에야 DB 를 본다.
 */

const { USE_CHOICES, EXPIRY_CHOICES, INVITE_LABEL_MAX, isUseChoice, isExpiryChoice } = await import(
  "@/server/invite/choices"
);

/** 왜 못 했는지를 돌려준다 — 서버 액션이 던진 오류 문구는 운영 빌드에서 지워진다. */
export type InviteBlock = "no-leader" | "bad-uses" | "bad-expiry" | "long-label" | "gone";

/**
 * 초대 한 장을 만든다. **원문 링크는 여기서 한 번만 나온다.**
 *
 * 다시 보여줄 수 없다 — 서버에는 해시만 남는다. 그래서 화면은 이 값을 받아 **지금 한 번만**
 * 보여 주고, 다 쓴 뒤로는 "새 초대 만들기"를 쓰게 한다. 예전 재입장 코드와 같은 타협이다.
 */
export async function createInviteLink(input: {
  label?: string | null;
  maxUses?: number | null;
  expiresInDays?: number | null;
}): Promise<
  | { ok: true; token: string; id: string; label: string | null; maxUses: number | null; expiresAt: string | null }
  | { ok: false; reason: InviteBlock }
> {
  const leader = await requireLeader();

  const label = input.label?.trim();
  // 이름이 없어도 된다. 하지만 **부르면 잘라서 넣는다** — 목록과 확인 화면에 그대로 나오므로
  // 거절할 이유가 없다(같은 이유로 강의명을 자르는 것과 같다).
  if (label && label.length > INVITE_LABEL_MAX) return { ok: false, reason: "long-label" };

  // 화면이 고른 값을 **서버가 다시 본다.** 서버 액션은 화면을 거치지 않고 POST 로 바로 불릴 수
  // 있으므로, 여기서 확인하지 않으면 "10명"이나 "365일"이 그대로 들어간다 — 그건 1회용의
  // 반대편이다(한 번도 안 쓰이는 초대가 되거나, 사실상 영구 초대가 된다).
  const maxUses = input.maxUses ?? null;
  if (!isUseChoice(maxUses)) return { ok: false, reason: "bad-uses" };

  const days = input.expiresInDays ?? null;
  if (!isExpiryChoice(days)) return { ok: false, reason: "bad-expiry" };

  const expiresAt = days === null ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const { invite, token } = await createTeamInvite(leader.teamId, { label, maxUses, expiresAt });

  revalidatePath("/team");
  revalidatePath("/home");
  return {
    ok: true,
    token,
    id: invite.id,
    label: invite.label,
    maxUses: invite.maxUses,
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
  };
}

/**
 * 초대를 비활성화한다. **삭제하지 않는다** — 되돌렸다는 사실이 남아야 "저 링크 왜 안 되지"
 * 를 나중에 설명할 수 있다.
 */
export async function disableInviteLink(
  inviteId: string,
): Promise<"ok" | "gone"> {
  const leader = await requireLeader();
  const revoked = await revokeTeamInvite(inviteId, leader.teamId);
  if (!revoked) return "gone";

  revalidatePath("/team");
  revalidatePath("/home");
  return "ok";
}
