"use server";

import { revalidatePath } from "next/cache";
import { RANDOM_TOOLS, ROLES } from "@/data/catalog";
import { drawPoolOf, toRoleKey, type NoDrawPool } from "@/features/roles/roster-model";
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

/**
 * 그 역할을 1순위로 고른 지금 팀원에서 **Veto 한 사람과 이미 거절한 사람**을 뺀 후보.
 * 규칙 자체는 `roster-model` 의 `drawPoolOf` 다 — 07 화면의 연출 후보와 여기서
 * 어긋나면 룰렛이 엉뚱한 사람을 가리키므로 한 함수를 함께 쓴다.
 */
async function candidatesFor(teamId: string, role: RoleKey) {
  const [wanters, rejections] = await Promise.all([
    // 팀을 나간 사람은 뽑지 않는다 — 뽑혀도 수락할 사람이 없다.
    db.member.findMany({
      where: { teamId, wantRole: role, leftAt: null },
      select: { id: true, name: true, vetoRole: true },
    }),
    db.roleRejection.findMany({ where: { teamId, role }, select: { memberId: true } }),
  ]);

  return drawPoolOf(
    wanters.map((w) => ({ id: w.id, name: w.name, veto: toRoleKey(w.vetoRole) })),
    role,
    new Set(rejections.map((r) => r.memberId)),
  );
}

export type DrawResult =
  | { status: "ok"; winner: string }
  /** 뽑을 사람이 없다. 왜 없는지는 `noPool` 이 말해 준다. */
  | { status: "empty"; noPool: NoDrawPool }
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

  const { pool, noPool } = await candidatesFor(me.teamId, role);
  if (pool.length === 0) return { status: "empty", noPool: noPool ?? "no-wanters" };

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
export type AnswerResult = "ok" | "not-yours" | "gone" | "settled";

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

  // 두 동작이 **순서를 바꿔 가며 끼어들 수 있다.** 수락과 거절 버튼은 나란히 있고 둘 다
  // 눌린 채로 두고 갈 수 있다. 거절이 먼저 끝나면 추첨 행은 지워졌는데, 수락의 조건부
  // 갱신은 0행을 맞으면서도 아래 제출함 주인은 그대로 자기 이름으로 덮어쓴다 — 거절한
  // 사람에게 담당자가 넘어가는데 화면에는 "확정되었습니다" 만 떴다.
  // 그래서 **몇 행이 실제로 바뀌었는지** 보고, 0행이면 거절한 쪽의 승리를 따른다.
  const accepted = await db.$transaction(async (tx) => {
    // 확인한 사이에 바뀌었을 수 있어 조건에 당첨자와 대기 상태를 다시 건다.
    const claimed = await tx.roleDraw.updateMany({
      where: { id: draw.id, winnerId: me.id, accepted: false },
      data: { accepted: true },
    });
    if (claimed.count === 0) return false;

    // 역할이 정해지면 그 역할의 제출함 주인도 정해진다 — 드라이브가 "담당자 미정"으로
    // 남아 있으면 누가 낼 칸인지 알 수 없다.
    await tx.submissionBox.updateMany({
      where: { teamId: me.teamId, role },
      data: { ownerId: me.id },
    });
    return true;
  });

  if (!accepted) return "gone";
  revalidatePath("/team");
  revalidatePath("/drive", "layout");
  return "ok";
}

/** 당첨자 본인이 거절 — 제외 명단에 넣고 결과를 지워 다시 추첨할 수 있게 한다. */
export async function rejectRoleDraw(role: RoleKey): Promise<AnswerResult> {
  const me = await requireSessionMember();

  const { draw, result } = await myPendingDraw(me.teamId, role, me.id);
  if (!draw) return result;

  const rejected = await db.$transaction(async (tx) => {
    // 이미 수락된 결과는 거절로 뒤집지 않는다 — 거절은 "다시 뽑아 달라" 는 뜻이지
    // 확정된 것을 빼아내라는 뜻이 아니다.
    const removed = await tx.roleDraw.deleteMany({
      where: { id: draw.id, winnerId: me.id, accepted: false },
    });
    if (removed.count === 0) return false;

    await tx.roleRejection.upsert({
      where: {
        teamId_role_memberId: { teamId: me.teamId, role, memberId: me.id },
      },
      update: {},
      create: { teamId: me.teamId, role, memberId: me.id },
    });
    return true;
  });

  if (!rejected) return "gone";

  revalidatePath("/team");
  return "ok";
}

/**
 * **혼자** 그 역할을 1순위로 고른 사람이 그 역할을 맡는다.
 *
 * 왜 이것이 필요한가: `RoleDraw` 는 추첨할 때만 생긴다. 그런데 1순위 희망자가 **한 명**이면
 * 겹칠 일이 없어 추첨 자체가 일어나지 않는다 — 그래서 07 화면의 상태 칩은 "확정 예정"이라
 * 말하면서 아무 길도 띄우지 않고, 드라이브의 제출함 주인은 영영 `null` 로 남았다. "확정 예정"
 * 이라는 말은 결국 아무것도 확정되지 않았다는 뜻이었다.
 *
 * 추첨과 같은 결과를 만든다: `RoleDraw` 를 **수락된 상태로** 남기고 제출함 주인을 정한다.
 * 그러면 이후 상태 표시가 "확정 · 김민준" 으로 한 갈래로 읽히고, 추첨이 더 이상 필요 없다는
 * 사실(행을 못 만든다)도 같이 성립한다. 따로 만드는 상태를 만들지 않는 이유다.
 *
 * 누가 호출해도 되는 것은 아니다 — **지금 그 역할을 1순위로 고른 사람이 혼자일 때만** 되고,
 * 이미 결과가 있으면 거절하듯 다시 만들 수 없다. 안전망은 유일 인덱스다.
 */
export async function claimSoleRole(role: RoleKey): Promise<AnswerResult> {
  const me = await requireSessionMember();
  if (!ROLE_KEYS.has(role)) throw new Error("알 수 없는 역할입니다.");

  const [wanters, taken] = await Promise.all([
    db.member.findMany({
      where: { teamId: me.teamId, wantRole: role, leftAt: null },
      select: { id: true },
    }),
    db.roleDraw.findUnique({ where: { teamId_role: { teamId: me.teamId, role } }, select: { id: true } }),
  ]);
  // 이미 결과가 있으면 예전과 같다 — 거절하듯 다시 만들 수 없다.
  if (taken) return "settled";
  // 겹치는 사람이 있으면 그건 추첨 몫이다 — 이 길은 "혼자 인 경우" 에만 다��인다.
  if (wanters.length !== 1 || wanters[0].id !== me.id) return "not-yours";

  try {
    await db.$transaction([
      db.roleDraw.create({
        data: { teamId: me.teamId, role, tool: "담당", winnerId: me.id, accepted: true },
      }),
      db.submissionBox.updateMany({
        where: { teamId: me.teamId, role },
        data: { ownerId: me.id },
      }),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return "settled";
    throw error;
  }

  revalidatePath("/team");
  revalidatePath("/drive", "layout");
  return "ok";
}
