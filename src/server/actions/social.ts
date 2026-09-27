"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { MENU_OPTIONS } from "@/data/catalog";
import { db } from "@/server/db";
import { notify, teamMemberIds } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";

/**
 * 29 메뉴 룰렛.
 *
 * **결과는 팀에 하나다.** 예전에는 폰마다 `Math.random()` 으로 따로 돌렸고 서버를 부르지도
 * 않았다. 팀원 네 명이 각자 다른 메뉴를 보고 무엇을 먹을지 합의가 되지 않았고, 새로고침하면
 * 또 다른 값이 나왔다. 정한 사람도 다시 정할 수 있다 — 그때도 값은 하나뿐이다.
 *
 * 역할 조율(07)의 추첨처럼 보이지만 **확정·수락이 없다.** 밥은 Roles 와 달리 아무도
 * 거부할 이유가 없고, 한 사람이 정하면 그걸로 가는 것이 팀의 속도다. 그래서 추첨 결과의
 * 수락·거절·제외 같은 장치가 없다 — 있는지만 저장한다.
 *
 * 무작위는 `crypto.randomInt` 다. `ice/rules.ts` 와 같은 이유다.
 */
export async function spinMenu(): Promise<string> {
  const me = await requireSessionMember();

  const picked = MENU_OPTIONS[randomInt(MENU_OPTIONS.length)];
  const replaced = await db.team.findUnique({
    where: { id: me.teamId },
    select: { menuPick: true },
  });

  await db.team.update({
    where: { id: me.teamId },
    data: { menuPick: picked, menuDrawnBy: me.id, menuPickedAt: new Date() },
  });

  await notify({
    to: await teamMemberIds(me.teamId),
    kind: "icebreak",
    title: `${me.name}님이 밥을 정했습니다`,
    body: replaced?.menuPick ? `${replaced.menuPick} 대신 → ${picked}` : picked,
    href: "/team/roulette",
    actorId: me.id,
  });

  revalidatePath("/team", "layout");
  return picked;
}
