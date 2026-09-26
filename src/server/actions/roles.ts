"use server";

import { revalidatePath } from "next/cache";
import { RANDOM_TOOLS, ROLES } from "@/data/catalog";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import type { RoleKey } from "@/lib/types";

/**
 * 07 역할 조율 서버 액션.
 *
 * **당첨자는 서버가 고른다.** 화면이 뽑아서 보내면 누구나 자기를 당첨자로 적어 보낼 수 있다.
 * 후보도 서버가 다시 구한다 — 그 역할을 1순위로 고른 같은 팀의 **지금** 팀원만 들어간다.
 *
 * **수락·거절은 당첨자 본인만 한다.** 예전에는 누가 눌러도 됐다 — 남의 당첨을 대신 수락하면
 * 제출함 주인이 누른 사람으로 바뀌었고, 대신 거절하면 원하지 않는 후보를 하나씩 빼서
 * 결과를 고를 수 있었다. 역할을 희망·Veto 로만 공정하게 정한다는 약속이 서버에서 새던 자리다.
 *
 * 실패는 던지지 않고 돌려준다 — 운영 빌드는 던진 오류의 문구를 지운다.
 */

const ROLE_KEYS = new Set<string>(ROLES.map((r) => r.key));
const TOOL_NAMES = new Set<string>(RANDOM_TOOLS.map((t) => t.name));

/** 그 역할을 1순위로 고른 지금 팀원에서 이미 거절한 사람을 뺀 후보. */
async function candidatesFor(teamId: string, role: RoleKey) {
  const [wanters, rejections] = await Promise.all([
    // 팀을 나간 사람은 뽑지 않는다 — 뽑혀도 수락할 사람이 없다.
    db.member.findMany({
      where: { teamId, wantRole: role, leftAt: null },
      select: { id: true, name: true },
    }),
    db.roleRejection.findMany({ where: { teamId, role }, select: { memberId: true } }),
  ]);

  const excluded = new Set(rejections.map((r) => r.memberId));
  const remaining = wanters.filter((w) => !excluded.has(w.id));

  // 전원이 거절해 후보가 비면 제외를 무시하고 전체에서 다시 뽑는다 —
  // 아무도 못 뽑는 상태로 막히는 것보다 낫다.
  return remaining.length > 0 ? remaining : wanters;
}

export type DrawResult =
  | { status: "ok"; winner: string }
  /** 뽑을 사람이 없다. */
  | { status: "empty" }
  /** 이미 결과가 나와 있다(수락 대기 또는 확정). 거절돼야 다시 뽑을 수 있다. */
  | { status: "settled" };

/**
 * 추첨한다. 결과는 **바로 확정되지 않고** 당사자의 수락을 기다린다.
 *
 * 결과가 이미 있으면 다시 뽑지 않는다. 덮어쓸 수 있으면 마음에 드는 사람이 나올 때까지
 * 다시 돌릴 수 있고, 확정된 역할까지 "수락 대기"로 되돌아간다(예전에는 그랬다).
 * 다시 뽑는 길은 당첨자가 거절하는 것 하나다.
 */
export async function drawForRole(role: RoleKey, toolName: string): Promise<DrawResult> {
  const me = await requireSessionMember();
  if (!ROLE_KEYS.has(role)) throw new Error("알 수 없는 역할입니다.");
  if (!TOOL_NAMES.has(toolName)) throw new Error("알 수 없는 추첨 도구입니다.");

  const existing = await db.roleDraw.findUnique({
    where: { teamId_role: { teamId: me.teamId, role } },
    select: { id: true },
  });
  if (existing) return { status: "settled" };

  const pool = await candidatesFor(me.teamId, role);
  if (pool.length === 0) return { status: "empty" };

  const winner = pool[Math.floor(Math.random() * pool.length)];

  try {
    await db.roleDraw.create({
      data: { teamId: me.teamId, role, tool: toolName, winnerId: winner.id },
    });
  } catch (error) {
    // 두 사람이 동시에 눌렀다 — 먼저 들어간 결과를 따른다.
    if ((error as { code?: string }).code === "P2002") return { status: "settled" };
    throw error;
  }

  revalidatePath("/team");
  return { status: "ok", winner: winner.name };
}

/** 수락·거절의 결과. `not-yours` 는 당첨자가 아닌 사람이 누른 것이다. */
export type AnswerResult = "ok" | "not-yours" | "gone";

/** 지금 답을 기다리는 추첨 — 내가 당첨자일 때만 돌려준다. */
async function myPendingDraw(teamId: string, role: RoleKey, meId: string) {
  const draw = await db.roleDraw.findUnique({
    where: { teamId_role: { teamId, role } },
    include: { winner: { select: { id: true, name: true } } },
  });
  if (!draw || draw.accepted) return { draw: null, result: "gone" as const };
  if (draw.winnerId !== meId) return { draw: null, result: "not-yours" as const };
  return { draw, result: null };
}

/** 당첨자 본인이 수락 — 여기서 비로소 확정된다. */
export async function acceptRoleDraw(role: RoleKey): Promise<AnswerResult> {
  const me = await requireSessionMember();

  const { draw, result } = await myPendingDraw(me.teamId, role, me.id);
  if (!draw) return result;

  await db.$transaction([
    // 확인한 사이에 바뀌었을 수 있어 조건에 당첨자와 대기 상태를 다시 건다.
    db.roleDraw.updateMany({
      where: { id: draw.id, winnerId: me.id, accepted: false },
      data: { accepted: true },
    }),
    // 역할이 정해지면 그 역할의 제출함 주인도 정해진다 — 드라이브가 "담당자 미정"으로
    // 남아 있으면 누가 낼 칸인지 알 수 없다.
    db.submissionBox.updateMany({
      where: { teamId: me.teamId, role },
      data: { ownerId: me.id },
    }),
  ]);

  revalidatePath("/team");
  revalidatePath("/drive", "layout");
  return "ok";
}

/** 당첨자 본인이 거절 — 제외 명단에 넣고 결과를 지워 다시 추첨할 수 있게 한다. */
export async function rejectRoleDraw(role: RoleKey): Promise<AnswerResult> {
  const me = await requireSessionMember();

  const { draw, result } = await myPendingDraw(me.teamId, role, me.id);
  if (!draw) return result;

  await db.$transaction([
    db.roleRejection.upsert({
      where: {
        teamId_role_memberId: { teamId: me.teamId, role, memberId: me.id },
      },
      update: {},
      create: { teamId: me.teamId, role, memberId: me.id },
    }),
    db.roleDraw.deleteMany({ where: { id: draw.id, winnerId: me.id, accepted: false } }),
  ]);

  revalidatePath("/team");
  return "ok";
}
