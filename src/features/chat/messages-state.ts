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

/**
 * 아직 서버에 도착하지 않은 말에 붙이는 임시 id.
 *
 * **세는 수를 순번으로 두면 안 된다.** 이 id 로 `clientId` 를 만들고(`use-chat-thread.ts`),
 * 서버는 `@@unique([authorId, clientId])` 로 이미 저장된 말을 알아본다. 그런데 모듈 상태는
 * **페이지를 열 때마다 0 에서 다시 시작한다** — 새로고침·새 탭·PWA 재실행 뒤 첫 말은 또
 * `pending-1` 이 되고, 그러면 **지난 페이지 life 의 첫 말과 같은 값**이 되어 서버가 그 옛
 * 말을 돌려준다. 새 글은 저장되지도, 화면에 남지도 않고 옛 글로 바뀐다(두 번째 말부터야
 * 되돌아온다).
 *
 * 그래서 순번을 세지 말고 **겹치지 않는 값**을 만든다. 화면 안에서만 도는 임시 id 이므로
 * 서버가 이해할 필요는 없고, 유일하면 된다. */
function pendingId(): string {
  return `pending-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * 전송을 시작하며 즉시 화면에 얹는 말풍선. 반환값은 이후 상태를 바꿀 때 쓰는 임시 id.
 *
 * `sortAt` 은 `null` 로 둔다 — 아직 서버에 도착하지 않았으므로 순서를 정할 시각이 없다.
 * 서버가 준 시각이 오면 `resolvePendingMessage` 가 채운다.
 *
 * `purifiedText` 는 **null 로 고정한다.** 내 말은 순화 대상이 아니다(`read-cushion.ts` 의
 * `canPurify`) — 낙관적 말풍선에 순화본이 붙으면 내가 보낼 말을 다른 사람이 본 뜻으로
 * 미리 고쳐 놓은 것처럼 보인다.
 */
export function addPendingMessage(
  threadId: string,
  message: Omit<ChatMessage, "id" | "time" | "status" | "sortAt" | "purifiedText">,
): string {
  const tempId = pendingId();
  update(threadId, (thread) => [
    ...thread,
    { ...message, id: tempId, time: null, sortAt: null, status: "sending", purifiedText: null },
  ]);
  return tempId;
}

/** 서버가 실제로 만든 id·시각으로 바꾼다 — 이제 "보낸" 메시지다. */
export function resolvePendingMessage(
  threadId: string,
  tempId: string,
  sent: { id: string; time: string; sortAt: string },
) {
  update(threadId, (thread) =>
    thread.map((m) =>
      m.id === tempId ? { ...m, id: sent.id, time: sent.time, sortAt: sent.sortAt, status: "sent" } : m,
    ),
  );
}

export function markPendingFailed(threadId: string, tempId: string) {
  update(threadId, (thread) => thread.map((m) => (m.id === tempId ? { ...m, status: "failed" } : m)));
}

/** 보내 봐야 소용없는 말(형식·크기로 거절된 파일)은 말풍선을 거둔다. 이유는 화면이 알린다. */
export function removePendingMessage(threadId: string, tempId: string) {
  forgetPendingFile(tempId);
  update(threadId, (thread) => thread.filter((m) => m.id !== tempId));
}

/**
 * 아직 서버에 붙이지 못한 파일 작업.
 *
 * **메모리에 모듈로 둔다 — 컴포넌트의 `useRef` 로 두면 안 된다.** 화면을 나갔다 다시 들어오면
 * `useRef` 는 새 것이고 말풍선은 모듈 상태라 그대로 남아 있어, "다시 보내기"를 눌렀는데
 * 되돌릴 파일이 없어 빈 글 전송이 되고 **아무 일도 일어나지 않는** 상태가 된다. 파일 객체는
 * 메모리에만 있으므로 새로고침 전까지는 그대로 살아 있다.
 */
type PendingFile = { file: File; path: string | null; threadId: string };
const pendingFiles = new Map<string, PendingFile>();

export function setPendingFile(tempId: string, job: PendingFile) {
  pendingFiles.set(tempId, job);
}

export function getPendingFile(tempId: string): PendingFile | undefined {
  return pendingFiles.get(tempId);
}

export function forgetPendingFile(tempId: string) {
  pendingFiles.delete(tempId);
}

/**
 * 서버가 준 기록 뒤에 로컬에만 있는 말을 이어 붙인다. 서버에도 같은 id 가 있으면 로컬 쪽은 뺀다.
 *
 * **순서를 맞춘다.** 예전에는 로컬 말을 전부 뒤에 붙였으므로, 내가 보낸 "보내는 중…" 말풍선이
 * 그 3초 뒤 도착한 상대의 말보다 **아래**에 그려졌다. 대화가 거꾸로 읽힌다.
 *
 * 전송 중인 말은 서버 시각이 없다(`time === null`). 그걸 임의의 시각으로 지어 비교하면 또 틀리므로,
 * **아직 서버에 도착하지 않은 말은 지금 이 순간 이후에 생긴 것**으로 보고 맨 뒤에 둔다. 그래도
 * 전송에 성공해 시각이 생긴 말은 서버 목록과 같은 기준으로 섞여 그 위치에 놓인다.
 */
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
  if (extra.length === 0) return fromServer;

  // **`time` 으로 정렬하지 않는다.** 그건 "21:12" 같은 표시용 문자열이라 `Date.parse` 가
  // NaN 이고, 비교가 전부 거짓이 되어 정렬이 그대로 무시된다(대화가 뒤집힌 채로 남는다).
  // 순서를 위한 실제 시각은 `sortAt` 에 ISO 로 실려 온다.
  const stamp = (m: ChatMessage) =>
    m.sortAt === null ? Number.POSITIVE_INFINITY : Date.parse(m.sortAt);
  return [...fromServer, ...extra].sort((a, b) => stamp(a) - stamp(b));
}
