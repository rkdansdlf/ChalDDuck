"use client";

import { useSyncExternalStore } from "react";
import type { ChatMessage, DmThread } from "@/lib/types";

/**
 * 채팅 상태 — 이 세션에서 보낸 메시지와 읽은 스레드.
 *
 * 대화를 하다 다른 탭에 갔다 오면 방금 보낸 말이 사라지면 안 되고, 읽은 대화의
 * 안 읽음 배지도 다시 살아나면 안 된다. 그래서 React 밖에 둔다.
 *
 * TODO(서버): 메시지와 읽음 표시는 원래 서버가 갖는다. 지금은 내 브라우저 안에서만
 * 유지되고, 다른 팀원이 보낸 말은 들어오지 않는다.
 */

type State = {
  /** 스레드별로 이 세션에서 내가 보낸 메시지. */
  sent: Record<string, ChatMessage[]>;
  /** 열어 본 스레드 id. */
  read: string[];
};

const EMPTY: State = { sent: {}, read: [] };

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

/** 전송 결과가 정해진 메시지를 스레드에 붙인다. */
export function appendMessage(
  threadId: string,
  message: Omit<ChatMessage, "id" | "time" | "status"> & { ok: boolean },
): ChatMessage {
  const { ok, ...rest } = message;
  const created: ChatMessage = {
    ...rest,
    id: `local-${(messageSeq += 1)}`,
    time: ok ? "지금" : null,
    status: ok ? "sent" : "failed",
  };

  set({
    ...state,
    sent: { ...state.sent, [threadId]: [...(state.sent[threadId] ?? []), created] },
  });
  return created;
}

/** 실패한 메시지를 다시 보낸 결과로 갱신한다. */
export function settleMessage(threadId: string, messageId: string, ok: boolean) {
  const thread = state.sent[threadId];
  if (!thread) return;

  set({
    ...state,
    sent: {
      ...state.sent,
      [threadId]: thread.map((m) =>
        m.id === messageId ? { ...m, status: ok ? "sent" : "failed", time: ok ? "지금" : null } : m,
      ),
    },
  });
}

export function markThreadRead(threadId: string) {
  if (state.read.includes(threadId)) return;
  set({ ...state, read: [...state.read, threadId] });
}

/** 서버 기록 뒤에 이 세션에서 보낸 말을 이어 붙인다. */
export function useThreadMessages(threadId: string, fromServer: ChatMessage[]): ChatMessage[] {
  const sent = useSyncExternalStore(
    subscribe,
    () => state.sent,
    () => EMPTY.sent,
  );
  const mine = sent[threadId];
  return mine ? [...fromServer, ...mine] : fromServer;
}

/** 열어 본 대화의 안 읽음 수는 0 으로 친다. */
export function useUnreadThreads(threads: DmThread[]): DmThread[] {
  const read = useSyncExternalStore(
    subscribe,
    () => state.read,
    () => EMPTY.read,
  );
  return threads.map((t) => (read.includes(t.id) ? { ...t, unread: 0 } : t));
}

/** 채팅 탭 배지 — 아직 열어 보지 않은 대화의 안 읽음 합계. */
export function usePendingChatCount(threads: DmThread[]): number {
  return useUnreadThreads(threads).reduce((sum, t) => sum + t.unread, 0);
}
