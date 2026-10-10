"use client";

/**
 * 단톡방 입력창 ↔ 쿠션 번역기 간의 핸드오프 스토어.
 *
 * 주소(`?text=`)에 싣지 않는다 — 보내기 전의 말이 브라우저 기록과 서버 로그에 남는다.
 * 화면 전환이 클라이언트 안에서 일어나므로 모듈 변수로 충분하다.
 *
 * **`useSyncExternalStore` 로 읽는다.** 서버는 이 값을 모른다 — 그래서 첫 렌더를
 * 서버 스냅샷(`null`)으로 그리고 hydrate 가 끝난 뒤 클라이언트 값으로 다시 그린다.
 */

export type CushionSource = "chat" | "poke" | "tools";

export interface CushionHandoffMeta {
  source: CushionSource;
  returnTo: string;
  context?: {
    assignee?: string;
    taskTitle?: string;
  };
}

let draft: string | null = null;
let handoffMeta: CushionHandoffMeta | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** 스토어 구독 — `useSyncExternalStore` 가 받는 세 값 중 첫 번째. */
export function subscribeCushionDraft(onChange: () => void): () => void {
  return subscribe(onChange);
}

export function handOffToCushion(
  text: string,
  meta?: {
    source?: CushionSource;
    returnTo?: string;
    context?: { assignee?: string; taskTitle?: string };
  },
) {
  const next = text.trim() || null;
  draft = next;
  handoffMeta = next
    ? {
        source: meta?.source ?? "tools",
        returnTo:
          meta?.returnTo ??
          (meta?.source === "chat"
            ? "/chat/team"
            : meta?.source === "poke"
              ? "/home/tasks"
              : "/tools"),
        context: meta?.context,
      }
    : null;
  emit();
}

/** 넘겨받은 글을 본다. 지우지는 않는다 — 화면이 이겨(read) 가는 동안에는 남아 있어야 한다. */
export function peekCushionDraft(): string | null {
  return draft;
}

/** 넘겨받은 출처 및 복귀 메타데이터를 본다. */
export function peekCushionMeta(): CushionHandoffMeta | null {
  return handoffMeta;
}

/** 서버 스냅샷. 서버에게는 이 값이 없다 — 항상 `null` 이고, 그래서 첫 렌더가 맞는다. */
export function noCushionDraft(): null {
  return null;
}

/**
 * 화면에 옮겨 담은 뒤 부른다. 다음에 메뉴로 열었을 때 지난 글이 다시 나오지 않게 한다.
 * 화면은 마운트를 벗어날 때(정리 함수) 부른다.
 */
export function clearCushionDraft() {
  if (draft === null && handoffMeta === null) return;
  draft = null;
  handoffMeta = null;
  emit();
}

/* ─────────────────────────────────────────────────────────────
 * 역방향 핸드오프: 쿠션 번역기 → 단톡방 입력창(Composer)
 * ───────────────────────────────────────────────────────────── */
let composerDraft: string | null = null;
const composerListeners = new Set<() => void>();

function emitComposer() {
  for (const listener of composerListeners) listener();
}

export function subscribeComposerDraft(onChange: () => void): () => void {
  composerListeners.add(onChange);
  return () => {
    composerListeners.delete(onChange);
  };
}

/** 쿠션 번역기에서 "단톡방 입력창에 담기" 선택 시 호출. */
export function handOffToComposer(text: string) {
  const next = text.trim() || null;
  if (next === composerDraft) return;
  composerDraft = next;
  emitComposer();
}

export function peekComposerDraft(): string | null {
  return composerDraft;
}

export function noComposerDraft(): null {
  return null;
}

export function clearComposerDraft() {
  if (composerDraft === null) return;
  composerDraft = null;
  emitComposer();
}
