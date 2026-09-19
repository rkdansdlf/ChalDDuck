"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage } from "@/lib/types";

/**
 * 보내지 못한 메시지.
 *
 * 보낸 메시지는 이제 서버에 저장되고 화면이 새로 받아 온다. 여기 남는 것은
 * **전송에 실패해서 아직 서버에 없는 말**뿐이다 — 그마저 잃어버리면 사용자가 쓴 글이
 * 사라지므로, 다시 보낼 때까지 브라우저에 들고 있는다.
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

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

let messageSeq = 0;

export function addFailedMessage(
  threadId: string,
  message: Omit<ChatMessage, "id" | "time" | "status">,
): ChatMessage {
  const created: ChatMessage = {
    ...message,
    id: `unsent-${(messageSeq += 1)}`,
    time: null,
    status: "failed",
  };
  set({ ...state, [threadId]: [...(state[threadId] ?? []), created] });
  return created;
}

/** 다시 보내기에 성공했으면 목록에서 뺀다 — 서버가 들고 있으므로 화면이 새로 받아 온다. */
export function dropFailedMessage(threadId: string, messageId: string) {
  const thread = state[threadId];
  if (!thread) return;
  set({ ...state, [threadId]: thread.filter((m) => m.id !== messageId) });
}

/** 서버가 준 기록 뒤에 아직 못 보낸 말을 이어 붙인다. */
export function useThreadMessages(threadId: string, fromServer: ChatMessage[]): ChatMessage[] {
  const unsent = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
  const mine = unsent[threadId];
  return mine && mine.length > 0 ? [...fromServer, ...mine] : fromServer;
}
