"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { RANDOM_TOOLS } from "@/data/catalog";
import type { DiceClashRound, DiceDrawDetail } from "@/lib/types";
import { db } from "@/server/db";
import { notify, teamMemberIds } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";

/**
 * 29 누가 하지 — 팀 추첨.
 *
 * **결과는 팀에 하나다.** 예전에는 폰마다 `Math.random()` 으로 따로 돌렸고 서버를 부르지도
 * 않았다. 팀원 네 명이 각자 다른 메뉴를 보고 무엇을 먹을지 합의가 되지 않았고, 새로고침하면
 * 또 다른 값이 나왔다. 정한 사람도 다시 정할 수 있다 — 그때도 값은 하나뿐이다.
 *
 * 역할 조율(07)의 추첨처럼 보이지만 **확정·수락이 없다.** 한 사람이 정하면 그걸로
 * 가는 것이 팀의 속도다. 그래서 추첨 결과의 수락·거절·제외 같은 장치가 없다 —
 * 있는지만 저장한다.
 *
 * **어떤 도구로 정했는지도 결과와 짝으로 저장한다**(`menuTool`). 도구는 누가 눌렀는지만
 * 고르지만, 팀에 하나가 아니라면 "사다리타기로 정했는데 주사위룰 났어?"가 그대로 남는다.
 *
 * 무작위는 `crypto.randomInt` 다. `ice/rules.ts` 와 같은 이유다.
 */

/** 후보는 둘부터 스물까지. 하나면 추첨이 아니라 지명이고, 스물이 넘으면 바퀴가 안 읽힌다. */
const DRAW_OPTION_MIN = 2;
const DRAW_OPTION_MAX = 20;
const DRAW_OPTION_LABEL_MAX = 20;

/** 주사위 게임의 한 번 굴림이 끝나는 조건 — 동점자끼리 다시 굴린다. */
const DICE_MAX_ROUNDS = 20;

/**
 * 후보 이름 정리 — 앞뒤 빈칸을 떼고 빈 값을 버리고 겹친 것을 하나로 센다.
 *
 * 검증(개수·길이)은 호출자가 한다. 여기서 조용히 자르면 "스무 개 적었는데 열아홉 개만
 * 남았네"가 되어, 화면이 약속한 개수와 서버가 저장한 개수가 어긋난다.
 */
function cleanDrawLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    cleaned.push(label);
  }
  return cleaned;
}

/** 후보 목록이 추첨에 쓸 수 있는 모양인지. 아니면 화면에 그대로 보일 말을 돌려준다. */
function drawLabelsError(labels: string[]): string | null {
  if (labels.length < DRAW_OPTION_MIN) return "후보를 두 개 이상 적어 주세요.";
  if (labels.length > DRAW_OPTION_MAX) return "후보는 스무 개까지 정할 수 있습니다.";
  if (labels.some((label) => label.length > DRAW_OPTION_LABEL_MAX))
    return "긴 후보가 있습니다. 스무 자 안으로 적어 주세요.";
  return null;
}

/** 팀이 저장한 후보. 없으면 빈 목록 — 기본 목록을 두지 않는다. */
async function drawOptionsOf(teamId: string): Promise<string[]> {
  const rows = await db.drawOption.findMany({
    where: { teamId },
    select: { label: true },
    orderBy: { position: "asc" },
  });
  return rows.map((row) => row.label);
}

/**
 * 팀의 추첨 후보를 통째로 바꾼다.
 *
 * 덮어쓴다 — 하나씩 고치면 "지운 후보가 추첨에 또 나온다"는 어긋남이 생긴다.
 * 이미 정해진 결과(`menuPick`)는 건드리지 않는다. 후보를 바꾼다고 지난 결과가 바뀌면
 * 팀이 정한 사실이 흔들린다.
 */
export async function saveDrawOptions(labels: string[]): Promise<void> {
  const me = await requireSessionMember();
  const cleaned = cleanDrawLabels(labels);
  const error = drawLabelsError(cleaned);
  if (error) throw new Error(error);

  await db.$transaction([
    db.drawOption.deleteMany({ where: { teamId: me.teamId } }),
    db.drawOption.createMany({
      data: cleaned.map((label, position) => ({ teamId: me.teamId, label, position })),
    }),
  ]);

  revalidatePath("/team", "layout");
}

export async function spinMenu(toolName: string, labels?: string[]): Promise<string> {
  const me = await requireSessionMember();

  /**
   * 도구 이름은 `RANDOM_TOOLS` 에서 그대로 온다. 목록에 없는 값을 저장하면 화면에는 없는
   * 도구 이름이 남고(`"제빵기 로 정했습니다"`), 되돌릴 수 없다 — 메뉴를 다시 돌리면 새로
   * 덮어써지지만 그 사이에 읽는 사람은 잘못된 이름을 본다. 역할 추첨(`actions/roles`)과
   * 같은 자리에서 막는다.
   */
  const tool = RANDOM_TOOLS.find((t) => t.name === toolName);
  if (!tool) throw new Error("모르는 추첨 도구입니다.");

  /**
   * 후보는 그 자리에서 고른 값(`labels`)이 우선이고, 없으면 팀이 저장한 값이다.
   * 둘 다 없으면 돌릴 수 없다 — 기본 목록을 두지 않으므로 빈 목록으로 뽑으면
   * "없는 것 중에 정했다"는 거짓말이 된다. 주사위는 후보를 쓰지 않는다 — 팀원이
   * 곧 후보라 전원 굴림(`rollDiceClash`)으로만 정한다. 주사위로 여기를 부르면 후보
   * 중 하나가 나와 "주사위로 정했는데 왜 눈이 없지"가 된다.
   */
  if (tool.key === "dice") throw new Error("주사위 게임은 전원 굴리기로 정해 주세요.");
  const options = labels ? cleanDrawLabels(labels) : await drawOptionsOf(me.teamId);
  const error = drawLabelsError(options);
  if (error) throw new Error(error);

  const picked = options[randomInt(options.length)];
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
      // 이전 주사위 게임의 라운드 기록이 남으면 "이 결과는 몇 대 몇이었나"가 섞인다.
      menuDetail: null,
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

/**
 * 주사위 게임 — 팀원 전원이 굴려 눈이 가장 높은 사람이 이긴다.
 *
 * 버튼 한 번에 전원을 굴린다. 각자 자기 폰에서 굴리면 다 모일 때까지 기다려야 하고,
 * 안 굴린 사람이 있으면 판이 멈춘다 — 친목 기능이 출석 체크로 바뀐다.
 *
 * 동점이면 동점자끼리 다시 굴린다. 마지막까지 동점이면(사실상 없음, `DICE_MAX_ROUNDS` 가
 * 묶는다) 그중 한 명을 뽑는다 — 판을 끝내지 않는 것보다 정직하다.
 */
export async function rollDiceClash(): Promise<{ winner: string; rounds: DiceClashRound[] }> {
  const me = await requireSessionMember();
  const tool = RANDOM_TOOLS.find((t) => t.key === "dice");
  if (!tool) throw new Error("모르는 추첨 도구입니다.");

  const members = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  if (members.length < 2) throw new Error("주사위 게임은 두 명부터 할 수 있습니다.");

  const rounds: DiceClashRound[] = [];
  let contenders = members.map((m) => m.name);
  for (let round = 0; round < DICE_MAX_ROUNDS; round += 1) {
    const rolls = contenders.map((name) => ({ name, value: randomInt(1, 7) }));
    rounds.push({ rolls });
    const top = Math.max(...rolls.map((r) => r.value));
    contenders = rolls.filter((r) => r.value === top).map((r) => r.name);
    if (contenders.length === 1) break;
  }
  const winner = contenders.length === 1 ? contenders[0]! : contenders[randomInt(contenders.length)]!;

  const detail: DiceDrawDetail = { rounds, winner };
  await db.team.update({
    where: { id: me.teamId },
    data: {
      menuPick: winner,
      menuTool: tool.name,
      menuDrawnBy: me.id,
      menuPickedAt: new Date(),
      menuDetail: JSON.stringify(detail),
    },
  });

  await notify({
    to: await teamMemberIds(me.teamId),
    kind: "who-does-it",
    title: `${me.name}님이 주사위를 굴렸습니다`,
    body:
      rounds.length > 1
        ? `${tool.name} · ${members.length}명 ${rounds.length}번 굴려 ${winner}님이 이겼습니다`
        : `${tool.name} · ${winner}님이 가장 높습니다`,
    href: "/team/roulette",
    actorId: me.id,
  });

  revalidatePath("/team", "layout");
  return { winner, rounds };
}

/**
 * 29 추첨 결과를 단톡방에 공유한다.
 */
export async function shareDrawToChat(input: {
  title: string;
  toolName: string;
  pick: string;
  candidates: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireSessionMember();
    const timeLabel = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }).format(new Date());

    const lines = [
      `🎲 [${input.title || "누가 하지"} 추첨 결과]`,
      `• 당첨: ✨ ${input.pick}`,
      `• 추첨 도구: ${input.toolName}`,
      `• 후보: ${input.candidates.slice(0, 10).join(", ")}${input.candidates.length > 10 ? ` 외 ${input.candidates.length - 10}개` : ""}`,
    ];

    await db.message.create({
      data: {
        teamId: me.teamId,
        threadKey: "team",
        authorId: me.id,
        text: lines.join("\n"),
        whenLabel: timeLabel,
      },
    });

    revalidatePath("/chat", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "단톡방 공유에 실패했습니다.",
    };
  }
}
