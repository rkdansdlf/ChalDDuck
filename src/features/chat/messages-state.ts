"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage } from "@/lib/types";

/**
 * 로컬에서만 아는 메시지 상태.
 *
 * 보내는 순간 서버 응답을 기다리지 않고 화면에 먼저 얹는다("낙관적 갱신") — 매번
 * `router.refresh()`로 `/chat` 전체를 다시 받아 오면 화면이 깜빡이고 팀원이 늘수록 느려진다.
 *
 * `sending` 은 응답을 기다리는 중, `failed` 는 실패해서 다시 보내기가 필요한 것.
 * 성공하면 서버가 준 실제 id·시각으로 바꿔 둔다 — 나중에 서버 목록에 같은 메시지가
 * 들어와도 id 로 걸러내 두 번 보이지 않는다.
 */

type State = Record<string, ChatMessage[]>;

const EMPTY: State = {};

let state: State = EMPTY;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function update(threadId: string, transform: (thread: ChatMessage[]) => ChatMessage[]) {
  state = { ...state, [threadId]: transform(state[threadId] ?? []) };
  for (const listener of listeners) listener();
}

let tempSeq = 0;

/** 전송을 시작하며 즉시 화면에 얹는 말풍선. 반환값은 이후 상태를 바꿀 때 쓰는 임시 id. */
export function addPendingMessage(
  threadId: string,
  message: Omit<ChatMessage, "id" | "time" | "status">,
): string {
  const tempId = `pending-${(tempSeq += 1)}`;
  update(threadId, (thread) => [...thread, { ...message, id: tempId, time: null, status: "sending" }]);
  return tempId;
}

/** 서버가 실제로 만든 id·시각으로 바꾼다 — 이제 "보낸" 메시지다. */
export function resolvePendingMessage(
  threadId: string,
  tempId: string,
  sent: { id: string; time: string },
) {
  update(threadId, (thread) =>
    thread.map((m) => (m.id === tempId ? { ...m, id: sent.id, time: sent.time, status: "sent" } : m)),
  );
}

export function markPendingFailed(threadId: string, tempId: string) {
  update(threadId, (thread) => thread.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
}

/** 서버가 준 기록 뒤에 로컬에만 있는 말을 이어 붙인다. 서버에도 같은 id 가 있으면 로컬 쪽은 뺀다. */
export function useThreadMessages(threadId: string, fromServer: ChatMessage[]): ChatMessage[] {
  const all = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  const local = all[threadId];
  if (!local || local.length === 0) return fromServer;

  const serverIds = new Set(fromServer.map((m) => m.id));
  const extra = local.filter((m) => !serverIds.has(m.id));
  return extra.length > 0 ? [...fromServer, ...extra] : fromServer;
}
