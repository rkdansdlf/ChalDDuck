"use client";

import { useSyncExternalStore } from "react";
import type { ClerkCandidate, Task, TaskKindKey } from "@/lib/types";

/**
 * 할 일 상태.
 *
 * 21(할 일)과 24(콕 찌르기)가 같은 목록을 보고, AI 서기(20)가 반영한 업무도 여기에 들어온다.
 * 홈(11)의 "n건 남음"도 이 목록에서 센다.
 *
 * TODO(서버): 할 일과 상태 변경은 원래 팀원 모두가 같은 값을 보는 서버 상태다.
 * 지금은 내 브라우저 안에서만 유지된다.
 */

type State = {
  /** 이 세션에서 더해진 할 일 (직접 추가 + AI 서기 반영). */
  added: Task[];
  /** 서버 목록 위에 덮어쓴 상태 변경. */
  statuses: Record<string, Task["status"]>;
  /** 오늘 콕 찌르기를 보낸 할 일 id. */
  poked: string[];
};

const EMPTY: State = { added: [], statuses: {}, poked: [] };

let state: State = EMPTY;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

let taskSeq = 0;
const nextId = () => `local-${(taskSeq += 1)}`;

/** 할 일 → 진행 중 → 완료 → 할 일 순으로 돈다. */
const NEXT_STATUS: Record<Task["status"], Task["status"]> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};

export function cycleTaskStatus(task: Task) {
  set({ ...state, statuses: { ...state.statuses, [task.id]: NEXT_STATUS[task.status] } });
}

export function addTask(kind: TaskKindKey, title: string): Task {
  const created: Task = {
    id: nextId(),
    title,
    kind,
    assignee: null,
    mbti: null,
    due: "미정",
    status: "todo",
    source: "manual",
  };
  set({ ...state, added: [...state.added, created] });
  return created;
}

/**
 * AI 서기(20)가 확인받은 후보를 업무로 반영한다.
 *
 * 담당자는 사람이 확인한 값을 그대로 쓴다 — AI 가 추측한 값이 아니다.
 */
export function addTasksFromClerk(
  candidates: Array<Pick<ClerkCandidate, "title" | "due"> & { assignee: string | null }>,
) {
  const created: Task[] = candidates.map((c) => ({
    id: nextId(),
    title: c.title,
    kind: "team",
    assignee: c.assignee,
    mbti: null,
    due: c.due,
    status: "todo",
    source: "clerk",
  }));
  set({ ...state, added: [...state.added, ...created] });
}

/** 업무당 하루 한 번만 — 이미 보낸 업무는 다시 보낼 수 없다. */
export function pokeTask(taskId: string) {
  if (state.poked.includes(taskId)) return;
  set({ ...state, poked: [...state.poked, taskId] });
}

/** 서버 목록에 이 세션의 추가·상태 변경을 덮어 읽는다. */
export function useTasks(fromServer: Task[]): Task[] {
  const { added, statuses } = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );

  const all = added.length > 0 ? [...fromServer, ...added] : fromServer;
  return all.map((task) => {
    const status = statuses[task.id];
    return status ? { ...task, status } : task;
  });
}

export function usePokedTasks(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => state.poked,
    () => EMPTY.poked,
  );
}
