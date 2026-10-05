"use server";

import { revalidatePath } from "next/cache";
import { TASK_KINDS } from "@/data/catalog";
import type { Task, TaskKindKey } from "@/lib/types";
// ⚠️ **양쪽을 다 가져와야 한다.** 2단계-a2 의 매칭(`matchAssigneeToMember`)과 main 이
// 갱신한 권한 사유(`taskEditBlock`)가 같은 줄에서 충돌했다 — 어느 한쪽을 고르면 다른 쪽이
// 조용히 사라진다. 그게 병합에서 가장 위험한 일이다(돌아가서 찾기 어려운 쪽이 아니라
// **아무 일도 없던 쪽**).
import { shouldNotifyAssignee, taskEditBlock } from "@/lib/task-permission";
import { matchAssigneeToMember } from "@/lib/tool-assignee";
import { parseDueText } from "@/lib/due";
import { db } from "@/server/db";
import { notify } from "@/server/notify/create";
import { requireSessionMember } from "@/server/session";
import { recordTaskDoneContrib, unrecordTaskContrib } from "@/server/contrib/auto-record";

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

/**
 * 상태를 다음 단계로 넘긴다.
 *
 * ## 넣은 사람 + 팀장 (2026-09-28 결정)
 *
 * 예전에는 **누구나** anyone's 상태를 바꿨다. 그래서 남의 업무를 남이 "다 했다"로 닫을 수
 * 있었고 — 화면이 막는 대신 서버가 막는 자리였는데, 아무도 거기를 보지 않았다. 담당자 지정
 * 은 그때 닫았는데 이 자리는 그대로 남아 있었다.
 *
 * **담당자가 바꾸면 안 되는 이유**: 상태는 곧 "진행 중 / 끝남"이고, 그건 담당자의 것이지
 * 옆에서 지켜보던 사람의 것이 아니다. 넣은 사람이 바뀐 것도 눈치채지 못한 채 "다 했다"가
 * 되면 그 사람은 아무것도 모른다.
 *
 * 제목·담당자·기한과 **같은 규칙**으로 한다(`canEditTask`) — 한 가지만 열고 나머지를 열어 둔
 * 규칙은 사용자가 외우지 못하고, 외울 수 없는 규칙은 규칙이 아니다.
 */
export async function cycleTaskStatus(taskId: string): Promise<void> {
  const me = await requireSessionMember();

  const task = await db.task.findFirst({
    where: { id: taskId, teamId: me.teamId },
    // `recordTaskDoneContrib` 에 넘길 값도 여기서 읽는다 — 같은 행을 두 번 읽지 않는다.
    select: { id: true, status: true, createdById: true, title: true, assigneeId: true, due: true },
  });
  if (!task) throw new Error("할 일을 찾을 수 없습니다.");

  // 화면이 버튼을 숨겼다고 안전하지 않다 — 서버 액션은 POST 로 바로 부를 수 있다.
  const blocked = taskEditBlock(task, me);
  if (blocked) {
    throw new Error(
      blocked === "leader-only"
        ? "넣기 전에 있던 업무라 팀장만 상태를 바꿀 수 있습니다."
        : "남이 넣은 업무라 상태를 바꿀 수 없습니다.",
    );
  }

  const current = (task.status as Task["status"]) ?? "todo";
  const next = NEXT_STATUS[current] ?? "todo";

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: { status: next },
    });

    if (next === "done") {
      await recordTaskDoneContrib(tx, {
        id: task.id,
        title: task.title,
        assigneeId: task.assigneeId,
        due: task.due,
      });
    } else if (current === "done") {
      await unrecordTaskContrib(tx, task.id);
    }
  });

  revalidatePath("/home", "layout");
  revalidatePath("/team/contrib", "layout");
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
      dueAt: dueAtOf(fields.due, todayInSeoul()),
      status: "todo",
      source: "manual",
      // **주인을 남긴다** — 이것이 없으면 `canEditTask` 가 "누구나"로 되돌아간다
      // (아래 주석).
      createdById: me.id,
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
 *
 * ## 누가 고칠 수 있나 (2026-09-28)
 *
 * **만든 사람, 그리고 팀장.** 예전에는 팀원 누구나 남에게 일을 떠맡길 수 있었고 그 사실은
 * 화면 주석에만 적혀 있었다 — 막으려 해도 **`Task` 에 만든 사람이 없어서** 서버가 알 수
 * 없었다. 그래서 `createdById` 를 넣었다(`prisma` 마이그레이션).
 *
 * ## 주인이 `null` 인 할 일
 *
 * 넣기 전부터 있던 할 일이다. 주인이 **누구인지 되돌릴 수 없다** — 지어내면 근거 없는
 * 기록이 남고, 아무 말 없이 비우면 그 할 일은 아무도 못 고치게 된다. 그래서 **팀장만** 고칠
 * 수 있게 했다. 규칙에 예외가 하나 생긴 것이지만, 예외가 없으면 값이 의미를 잃는다.
 */
export async function updateTask(
  taskId: string,
  fields: { title: string; assignee?: string | null; due?: string | null },
): Promise<void> {
  const me = await requireSessionMember();

  const task = await db.task.findFirst({
    where: { id: taskId, teamId: me.teamId },
    select: { id: true, createdById: true },
  });
  if (!task) throw new Error("할 일을 찾을 수 없습니다.");
  // **같은 막힘에 같은 말을 한다.** 화면은 서버가 계산해 보낸 `editBlockedBecause` 로 "넣기 전에
  // 있던 업무라 팀장만 고칠 수 있습니다" 라고 말하는데, 여기서 "만든 사람이 아니어서" 라고 하면
  // **사용자는 두 개의 다른 이유로 같은 막힘을 받는다**(2026-09-28 에 검사에서 드러남). 같은
  // 막힘에 두 개의 다른 이유는 배워지지 않는다.
  const block = taskEditBlock(task, me);
  if (block) {
    throw new Error(
      block === "leader-only"
        ? "넣기 전에 있던 업무라 팀장만 고칠 수 있습니다."
        : "남이 넣은 업무라 고칠 수 없습니다.",
    );
  }

  const title = fields.title.trim().slice(0, MAX_TITLE);
  if (!title) throw new Error("할 일 제목을 적어 주세요.");

  const nextAssigneeId = await assigneeIdOf(me.teamId, fields.assignee);
  // **누가 누구에게** 배정했는지 — 알림 문장에 들어간다(아래).
  const beforeAssigneeId = await db.task.findUnique({ where: { id: task.id }, select: { assigneeId: true } });

  await db.task.update({
    where: { id: task.id },
    data: {
      title,
      assigneeId: nextAssigneeId,
      due: dueOf(fields.due),
      // ⚠️ **마감 문구를 고치면 정규값도 함께 고쳐야 한다.** 여기서 빠뜨리면 `dueAt` 이 옛
      // 값을 남아 "마감이 3일 뒤" 같은 말이 **거짓말**이 된다 — 사람이 고친 값과 화면이
      // 말하는 값이 어긋난다. 그래서 **한 곳에서 둘을 같이 만든다.**
      dueAt: dueAtOf(fields.due, todayInSeoul()),
      // **주인이 없던 업무는 지금 고치는 사람이 주인이 된다**(2026-09-28).
      //
      // 넣기 전에 있던 할 일이라 주인이 `null` 이고, 팀장만 고칠 수 있었다. 그런데 그 상태로
      // 두면 팀장이 한 번 고친 뒤에도 계속 팀장만 고칠 수 있게 남아, "왜 이 사람만 되나" 가
      // 영영 풀리지 않는다. 팀장이 **내가 맡은 것**으로 확인한 것이니 그 사람이 주인이 되는
      // 것이 사실과 맞다.
      createdById: task.createdById ?? me.id,
    },
  });

  await notifyAssignee(me, task.id, nextAssigneeId, beforeAssigneeId?.assigneeId ?? null);
  revalidatePath("/home", "layout");
}

/**
 * **맡은 사람은 그 사실을 알게 해야 한다**(2026-09-28).
 *
 * 예전에는 배정이 조용했다 — 행만 쓰고 아무도 말하지 않았다. 담당자는 자기 할 일 목록을
 * 열어서야 알게 되고, 그 사이에 "안 받기로" 할 기회도 없다. 앱이 다른 모든 변경(회의 확정·
 * 기여 확인·콤 찌르기)은 말하는데 **담당 배정만 조용했다** — 그게 유일한 구멍이었다.
 *
 * ## 무엇을 하지 않는가
 *
 * - **배정을 미루지 않는다.** 수락을 기다리는 상태는 4명 팀에 절차가 되고, "안 받으면
 *   언제까지" 같은 새 정책이 한 벌 더 생긴다. 배정은 지금 바로 효력이 있다.
 * - **이미 그 사람에게 있던 것이면 말하지 않는다.** 넣을 때 이미 알았다.
 * - **담당자를 비우면 말하지 않는다.** 돌아갈 사람이 없기 때문이다.
 * - **나에게 배정하면 말하지 않는다.** `notify` 가 본인을 걸러 내지만, 의도가 그럴
 *   리 없으므로 아예 부르지 않는다.
 */
async function notifyAssignee(
  me: { id: string; name: string },
  taskId: string,
  assigneeId: string | null,
  previousAssigneeId: string | null,
): Promise<void> {
  if (!assigneeId) return;
  if (!shouldNotifyAssignee(assigneeId, previousAssigneeId, me.id)) return;

  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true } });
  if (!task) return;

  await notify({
    to: [assigneeId],
    kind: "task-assigned",
    title: `${me.name}님이 업무를 맡겼습니다`,
    body: task.title,
    href: "/home/tasks",
    actorId: me.id,
  });
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
 * 사람이 쓴 마감 → **기계가 비교할 값**.
 *
 * ⚠️ **해석 못 하면 `null` 이고, 그건 정상이다.** `lib/due.ts` 의 규칙:
 * `"2026-09-19"` 만 확실하고, `"9/19"` 는 **아직 지나가지 않은 해** 로 읽으며,
 * `"9월쯤"`·`"다음 주"`·`"미정"` 은 **해석하지 않는다.** 사람의 뜻을 대신 정하지 않는다.
 *
 * **여기서 추측해 채우면 안 되는 이유** — 채워진 값은 **사실처럼 보인다.** 브리핑의
 * "마감 임박 N건"이 그 위에서 돌아가고, 사람이 그 숫자를 보고 독촉한다. **틀린 독촉**이 된다.
 * 모르는 것은 세지 않는 편이 낫다.
 *
 * `due` 문자열은 **그대로 둔다** — 사람이 쓴 것을 그대로 보여 주는 게 맞고, 기계만
 * `dueAt` 을 본다.
 */
function dueAtOf(due: string | null | undefined, today: string): Date | null {
  return parseDueText(dueOf(due), today);
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
  /**
   * 이름을 팀원 id 로 — **`lib/tool-assignee.ts` 의 매칭을 그대로 쓴다.**
   *
   * 예전에는 여기서 `roster.find((m) => m.name === name)` 로 **직접 정확 일치** 했다. 그래서
   * AI 서기가 `민준` 라고 적으면(명단에는 `김민준`) **항상 매칭에 실패해 담당자 없는 업무가
   * 생겼다** — 사람이 화면에서 이름을 눌러 고쳐야 했다. 그게 2단계-a2 가 고치는 실제 손해다.
   *
   * **매칭 규칙이 두 곳에 있으면 안 된다.** 서기 화면(AI 서기 → 후보 정리)과 여기(업무 반영)가
   * 서로 다른 규칙을 쓰면 "화면에서는 최유나 로 보이는데 업무에는 아무도 없다" 가 조용히
   * 벌어진다. 그래서 **한 함수만 쓴다.**
   *
   * 매칭되지 않으면 그대로 `null` 이다 — **없는 사람에게 일을 배정하지 않는다.** 담당자가 없는
   * 업무는 화면에 "담당자 정하기" 로 보이고 아무에게도 알림이 가지 않는다.
   */
  const idOf = (name: string | null) => matchAssigneeToMember(name, roster).id;

  await db.task.createMany({
    data: candidates
      .map((c) => ({
        teamId: me.teamId,
        title: c.title.trim().slice(0, MAX_TITLE),
        kind: "team",
        assigneeId: idOf(c.assignee),
        // **`dueOf` 를 쓴다.** 예전에는 `c.due` 를 그대로 넣었는데, 사람이 직접 넣는
        // `addTask`·`updateTask` 가 같은 40자 상한을 지킨 것과 어긋났다 — 한쪽은 잘리고
        // 다른 쪽은 그대로 들어간다.
        due: dueOf(c.due),
        // AI 서기가 뽑은 마감도 **같은 규칙**을 지난다. 서기가 "9/22" 라고 썼다고 그대로
        // 믿지 않는다 — 동일한 파서를 쓰므로 사람이 넣은 값과 서기가 만든 값의 오차가 없다.
        dueAt: dueAtOf(c.due, todayInSeoul()),
        status: "todo",
        source: "clerk",
        // AI 가 만든 것도 **확인한 사람**의 소유다. 사람이 누르고 확인한 목록이니까
        // (`server/ai/tools.ts` 계약) — 그래야 담당자를 고칠 수 있는 사람이 생긴다.
        // 여기까지 비우면 팀장만 고칠 수 있게 되어(아래 `canEditTask`) 짜증만 남는다.
        createdById: me.id,
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
