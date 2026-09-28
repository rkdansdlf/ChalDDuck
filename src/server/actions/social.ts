"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { MENU_OPTIONS, RANDOM_TOOLS } from "@/data/catalog";
import { db } from "@/server/db";
import { notify, teamMemberIds } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";

/**
 * 29 누가 하지.
 *
 * **결과는 팀에 하나다.** 예전에는 폰마다 `Math.random()` 으로 따로 돌렸고 서버를 부르지도
 * 않았다. 팀원 네 명이 각자 다른 메뉴를 보고 무엇을 먹을지 합의가 되지 않았고, 새로고침하면
 * 또 다른 값이 나왔다. 정한 사람도 다시 정할 수 있다 — 그때도 값은 하나뿐이다.
 *
 * 역할 조율(07)의 추첨처럼 보이지만 **확정·수락이 없다.** 밥은 Roles 와 달리 아무도
 * 거부할 이유가 없고, 한 사람이 정하면 그걸로 가는 것이 팀의 속도다. 그래서 추첨 결과의
 * 수락·거절·제외 같은 장치가 없다 — 있는지만 저장한다.
 *
 * **어떤 도구로 정했는지도 결과와 짝으로 저장한다**(`menuTool`). 도구는 누가 눌렀는지만
 * 고르지만, 팀에 하나가 아니라면 "사다리타기로 정했는데 주사위룰 났어?"가 그대로 남는다.
 *
 * 무작위는 `crypto.randomInt` 다. `ice/rules.ts` 와 같은 이유다.
 */
export async function spinMenu(toolName: string): Promise<string> {
  const me = await requireSessionMember();

  /**
   * 도구 이름은 `RANDOM_TOOLS` 에서 그대로 온다. 목록에 없는 값을 저장하면 화면에는 없는
   * 도구 이름이 남고(`"제빵기 로 정했습니다"`), 되돌릴 수 없다 — 메뉴를 다시 돌리면 새로
   * 덮어써지지만 그 사이에 읽는 사람은 잘못된 이름을 본다. 역할 추첨(`actions/roles`)과
   * 같은 자리에서 막는다.
   */
  const tool = RANDOM_TOOLS.find((t) => t.name === toolName);
  if (!tool) throw new Error("모르는 추첨 도구입니다.");

  const picked = MENU_OPTIONS[randomInt(MENU_OPTIONS.length)];
  const replaced = await db.team.findUnique({
    where: { id: me.teamId },
    select: { menuPick: true },
  });

  await db.team.update({
    where: { id: me.teamId },
    data: {
      menuPick: picked,
      menuTool: tool.name,
      menuDrawnBy: me.id,
      menuPickedAt: new Date(),
    },
  });

  await notify({
    to: await teamMemberIds(me.teamId),
    kind: "who-does-it",
    title: `${me.name}님이 정했습니다`,
    // 도구를 앞에 붙인다 — 본인이 뭘로 정했는지 남지 않으면 팀원은 "몇 명이 같은 걸로
    // 돌린 거지?" 하고 되묻는다.
    body: replaced?.menuPick
      ? `${tool.name} · ${replaced.menuPick} 대신 → ${picked}`
      : `${tool.name} · ${picked}`,
    href: "/team/roulette",
    actorId: me.id,
  });

  revalidatePath("/team", "layout");
  return picked;
}
