"use server";

import { revalidatePath } from "next/cache";
import { TASK_KINDS } from "@/data/catalog";
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

const TASK_KIND_KEYS = new Set<string>(TASK_KINDS.map((k) => k.key));

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
export async function addTask(
  kind: TaskKindKey,
  title: string,
  fields: { assignee?: string | null; due?: string | null } = {},
): Promise<void> {
  const me = await requireSessionMember();

  const trimmed = title.trim().slice(0, MAX_TITLE);
  if (!trimmed) throw new Error("할 일 제목을 적어 주세요.");
  // 종류는 서버 액션으로 직접 불릴 수 있다 — 표에는 `String` 으로 들어가므로
  // 모르는 값이 오면 어느 종류로도 열리지 않는 항목이 된다.
  if (!TASK_KIND_KEYS.has(kind)) throw new Error("알 수 없는 할 일 종류입니다.");

  await db.task.create({
    data: {
      teamId: me.teamId,
      title: trimmed,
      kind,
      assigneeId: await assigneeIdOf(me.teamId, fields.assignee),
      due: dueOf(fields.due),
      status: "todo",
      source: "manual",
    },
  });

  revalidatePath("/home", "layout");
}

/**
 * 할 일 하나를 고친다 — 제목·담당자·기한.
 *
 * 이 길이 없이는 사람이 추가한 할 일이 영영 `새 팀 업무 / 담당자 미정 / 미정` 으로
 * 남았다. 담당자가 없으면 콕 찌르기도 대상이 되지 못하니, 사실상 쓸 수 없는 항목이 된다.
 *
 * 담당자는 **우리 팀에 있는 지금 사람**만 담는다. 모르는 이름을 보내면 비워 둔다
 * (`addTasksFromClerk` 와 같은 이유 — 없는 사람에게 일을 배정하지 않는다).
 */
export async function updateTask(
  taskId: string,
  fields: { title: string; assignee?: string | null; due?: string | null },
): Promise<void> {
  const me = await requireSessionMember();

  const task = await db.task.findFirst({ where: { id: taskId, teamId: me.teamId }, select: { id: true } });
  if (!task) throw new Error("할 일을 찾을 수 없습니다.");

  const title = fields.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error("할 일 제목을 적어 주세요.");

  await db.task.update({
    where: { id: task.id },
    data: {
      title,
      assigneeId: await assigneeIdOf(me.teamId, fields.assignee),
      due: dueOf(fields.due),
    },
  });

  revalidatePath("/home", "layout");
}

/** 이름으로 담당자를 찾는다. 우리 팀에 지금 있는 사람만 — 없으면 미정으로 둔다. */
async function assigneeIdOf(teamId: string, name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const member = await db.member.findFirst({
    where: { teamId, name: trimmed, leftAt: null },
    select: { id: true },
  });
  return member?.id ?? null;
}

/** 기한. 빈칸이면 미정. 길이는 목록 한 칸에 들어갈 만큼만. */
function dueOf(due: string | null | undefined): string {
  const trimmed = due?.trim();
  return trimmed ? trimmed.slice(0, 40) : "미정";
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
 * @returns 보냈으면 `"sent"`, 오늘 이미 보냈으면 `"already"`, 보낼 사람이 없으면 `"no-one"`.
 */
export async function pokeTask(taskId: string): Promise<"sent" | "already" | "no-one"> {
  const me = await requireSessionMember();

  const task = await db.task.findFirst({
    where: { id: taskId, teamId: me.teamId },
    select: { id: true, title: true, status: true, assigneeId: true },
  });
  if (!task) throw new Error("할 일을 찾을 수 없습니다.");
  // 끝난 일과 담당자 없는 일은 찌를 대상이 아니다.
  if (task.status === "done" || !task.assigneeId) throw new Error("콕 찌를 수 있는 업무가 아닙니다.");
  // **내가 맡은 일을 나에게 찌르는 일**은 아니다. `notify` 는 본인을 recipient 에서
  // 빼므로 알림은 안 가는데, 화면은 "알렸습니다"를 보여 주고 그날의 한 번을 태운다.
  // 그다음 진짜로 남은 사람에게 다시 보내려면 다음날까지 기다려야 한다.
  if (task.assigneeId === me.id) throw new Error("내가 맡은 업무입니다. 진행 상황을 직접 적어 주세요.");

  // 팀을 나간 사람에게도 알림은 가지 않는다(`notify` 가 걸러 낸다). 그럴 때 "보냈습니다"
  // 라고 말하면 거짓말이다 — 남은 하루 한 번을 태우고 아무도 모른다.
  const assignee = await db.member.findFirst({
    where: { id: task.assigneeId, teamId: me.teamId, leftAt: null },
    select: { name: true },
  });
  if (!assignee) throw new Error("담당자가 이미 팀을 나갔습니다. 담당자를 다시 정해 주세요.");

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
