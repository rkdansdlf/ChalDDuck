"use server";

import { revalidatePath } from "next/cache";
import type { Task, TaskKindKey } from "@/lib/types";
import { db } from "@/server/db";
import { notify } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";

/**
 * 21 / 24 할 일 · 콕 찌르기 서버 액션.
 *
 * 할 일은 팀이 같이 보는 목록이다 — 내가 완료로 바꾼 것이 팀원 화면에서 그대로면
 * 체크리스트가 아무 역할도 하지 못한다.
 */

/** 할 일 → 진행 중 → 완료 → 할 일 순으로 돈다. 순서는 서버가 정한다. */
const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  todo: "doing",
  done: "todo",
  doing: "done",
};

/** 제목 길이 상한. 목록 한 줄에 들어가야 한다. */
const MAX_TITLE = 120;

/** 콕 찌르기의 "하루"는 한국 날짜다 — 서버가 어디서 돌든 같은 하루여야 한다. */
function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

/** 상태를 다음 단계로 넘긴다. */
export async function cycleTaskStatus(taskId: string): Promise<void> {
  const me = await requireSessionMember();

  const task = await db.task.findFirst({ where: { id: taskId, teamId: me.teamId } });
  if (!task) throw new Error("할 일을 찾을 수 없습니다.");

  const current = (task.status as Task["status"]) ?? "todo";
  await db.task.update({
    where: { id: task.id },
    data: { status: NEXT_STATUS[current] ?? "todo" },
  });

  revalidatePath("/home", "layout");
}

/**
 * 할 일을 하나 더한다.
 *
 * 담당자와 기한은 비워 둔 채로 들어간다 — 넣는 사람이 임의로 남을 배정하는 것보다
 * 미정으로 두고 목록에서 정하는 편이 낫다.
 */
export async function addTask(kind: TaskKindKey, title: string): Promise<void> {
  const me = await requireSessionMember();

  const trimmed = title.trim().slice(0, MAX_TITLE);
  if (!trimmed) throw new Error("할 일 제목을 적어 주세요.");

  await db.task.create({
    data: {
      teamId: me.teamId,
      title: trimmed,
      kind,
      assigneeId: null,
      due: "미정",
      status: "todo",
      source: "manual",
    },
  });

  revalidatePath("/home", "layout");
}

/**
 * AI 서기(20)가 확인받은 후보를 업무로 반영한다.
 *
 * 담당자는 **사람이 확인한 이름**만 쓴다 — AI 가 추측한 값이 아니다. 우리 팀에 없는
 * 이름이 오면 담당자를 비워 둔다. 모르는 이름으로 사람을 만들어 내지 않는다.
 */
export async function addTasksFromClerk(
  candidates: Array<{ title: string; due: string; assignee: string | null }>,
): Promise<void> {
  const me = await requireSessionMember();
  if (candidates.length === 0) return;

  const roster = await db.member.findMany({
    // 나간 사람에게 새 업무를 배정하지 않는다.
    where: { teamId: me.teamId, leftAt: null },
    select: { id: true, name: true },
  });
  const idOf = (name: string | null) =>
    name ? (roster.find((m) => m.name === name)?.id ?? null) : null;

  await db.task.createMany({
    data: candidates
      .map((c) => ({
        teamId: me.teamId,
        title: c.title.trim().slice(0, MAX_TITLE),
        kind: "team",
        assigneeId: idOf(c.assignee),
        due: c.due,
        status: "todo",
        source: "clerk",
      }))
      .filter((c) => c.title.length > 0),
  });

  revalidatePath("/home", "layout");
}

/**
 * 담당자에게 제출이나 진행상황을 요청한다.
 *
 * **보낸 사람을 밝힌다.** 누가 물었는지 알아야 답할 수 있고, 익명 재촉은 답할 곳 없는
 * 압박이 된다. 대신 **업무당 하루 한 번**으로 횟수를 막는다 — 화면에서 막는 것과 별개로
 * 표의 `@@unique([taskId, senderId, sentOn])` 이 마지막 문이다.
 *
 * @returns 보냈으면 `"sent"`, 오늘 이미 보냈으면 `"already"`.
 */
export async function pokeTask(taskId: string): Promise<"sent" | "already"> {
  const me = await requireSessionMember();

  const task = await db.task.findFirst({ where: { id: taskId, teamId: me.teamId } });
  if (!task) throw new Error("할 일을 찾을 수 없습니다.");
  // 끝난 일과 담당자 없는 일은 찌를 대상이 아니다.
  if (task.status === "done" || !task.assigneeId) throw new Error("콕 찌를 수 있는 업무가 아닙니다.");

  const sentOn = todayInSeoul();
  const existing = await db.poke.findUnique({
    where: { taskId_senderId_sentOn: { taskId: task.id, senderId: me.id, sentOn } },
  });
  if (existing) return "already";

  await db.poke.create({ data: { taskId: task.id, senderId: me.id, sentOn } });

  await notify({
    to: [task.assigneeId],
    kind: "poke",
    title: `${me.name}님이 진행상황을 물었습니다`,
    body: task.title,
    href: "/home/tasks",
    actorId: me.id,
  });

  revalidatePath("/home", "layout");
  return "sent";
}
