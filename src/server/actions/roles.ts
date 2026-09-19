"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import type { RoleKey } from "@/lib/types";

/**
 * 07 역할 조율 서버 액션.
 *
 * **당첨자는 서버가 고른다.** 화면이 뽑아서 보내면 누구나 자기를 당첨자로 적어 보낼 수 있다.
 * 후보도 서버가 다시 구한다 — 그 역할을 1순위로 고른 같은 팀 사람만 들어간다.
 */

/** 그 역할을 1순위로 고른 사람들에서 이미 거절한 사람을 뺀 후보. */
async function candidatesFor(teamId: string, role: RoleKey) {
  const [wanters, rejections] = await Promise.all([
    db.member.findMany({ where: { teamId, wantRole: role }, select: { id: true, name: true } }),
    db.roleRejection.findMany({ where: { teamId, role }, select: { memberId: true } }),
  ]);

  const excluded = new Set(rejections.map((r) => r.memberId));
  const remaining = wanters.filter((w) => !excluded.has(w.id));

  // 전원이 거절해 후보가 비면 제외를 무시하고 전체에서 다시 뽑는다 —
  // 아무도 못 뽑는 상태로 막히는 것보다 낫다.
  return remaining.length > 0 ? remaining : wanters;
}

/** 추첨한다. 결과는 **바로 확정되지 않고** 당사자의 수락을 기다린다. */
export async function drawForRole(
  role: RoleKey,
  toolName: string,
): Promise<{ winner: string } | null> {
  const me = await requireSessionMember();

  const pool = await candidatesFor(me.teamId, role);
  if (pool.length === 0) return null;

  const winner = pool[Math.floor(Math.random() * pool.length)];

  await db.roleDraw.upsert({
    where: { teamId_role: { teamId: me.teamId, role } },
    update: { tool: toolName, winnerId: winner.id, accepted: false },
    create: { teamId: me.teamId, role, tool: toolName, winnerId: winner.id },
  });

  revalidatePath("/team");
  return { winner: winner.name };
}

/** 당사자가 수락 — 여기서 비로소 확정된다. */
export async function acceptRoleDraw(role: RoleKey): Promise<void> {
  const me = await requireSessionMember();

  await db.roleDraw.update({
    where: { teamId_role: { teamId: me.teamId, role } },
    data: { accepted: true },
  });

  revalidatePath("/team");
}

/** 당사자가 거절 — 제외 명단에 넣고 결과를 지워 다시 추첨할 수 있게 한다. */
export async function rejectRoleDraw(role: RoleKey): Promise<{ winner: string } | null> {
  const me = await requireSessionMember();

  const draw = await db.roleDraw.findUnique({
    where: { teamId_role: { teamId: me.teamId, role } },
    include: { winner: { select: { id: true, name: true } } },
  });
  if (!draw) return null;

  await db.$transaction([
    db.roleRejection.upsert({
      where: {
        teamId_role_memberId: { teamId: me.teamId, role, memberId: draw.winner.id },
      },
      update: {},
      create: { teamId: me.teamId, role, memberId: draw.winner.id },
    }),
    db.roleDraw.delete({ where: { teamId_role: { teamId: me.teamId, role } } }),
  ]);

  revalidatePath("/team");
  return { winner: draw.winner.name };
}
