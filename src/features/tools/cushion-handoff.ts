"use client";

/**
 * 단톡방 입력창 → 쿠션 번역기로 들고 가는 글.
 *
 * 주소(`?text=`)에 싣지 않는다 — 보내기 전의 말이 브라우저 기록과 서버 로그에 남는다.
 * 화면 전환이 클라이언트 안에서 일어나므로 모듈 변수 하나로 충분하다. 새로고침하면
 * 사라지는데, 그때는 예시 문장으로 여는 원래 동작으로 돌아갈 뿐이다.
 *
 * **`useSyncExternalStore` 로 읽는다.** 서버는 이 값을 모른다 — 그래서 첫 렌더를
 * 서버 스냅샷(`null`)으로 그리고 hydrate 가 끝난 뒤 클라이언트 값으로 다시 그린다. 이게
 * hydrate 불일치를 피하는 **공식적인** 길이다. `useState(() => peekCushionDraft())` 처럼
 * 첫 상태를 바로 읽으면 서버의 `sample` 과 클라이언트의 글이 달라져 그 서브트리가 다시
 * 그려지고(예시 문장이 잠깐 떴다가 내 글로 바뀐다), 그 라우트에 hydration 오류가 남는다.
 * `onboarding-state.ts` · `review-mode.tsx` 도 같은 이유로 이 방식을 쓴다.
 */
let draft: string | null = null;
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

export function handOffToCushion(text: string) {
  const next = text.trim() || null;
  if (next === draft) return;
  draft = next;
  emit();
}

/** 넘겨받은 글을 본다. 지우지는 않는다 — 화면이 이겨(read) 가는 동안에는 남아 있어야 한다. */
export function peekCushionDraft(): string | null {
  return draft;
}

/** 서버 스냅샷. 서버에게는 이 값이 없다 — 항상 `null` 이고, 그래서 첫 렌더가 맞는다. */
export function noCushionDraft(): null {
  return null;
}

/**
 * 화면에 옮겨 담은 뒤 부른다. 다음에 메뉴로 열었을 때 지난 글이 다시 나오지 않게 한다.
 *
 * **화면이 떠 있는 동안 부르면 안 된다** — 읽던 값이 사라져 원문이 예시 문장으로 되돌아간다.
 * 그래서 화면은 마운트를 벗어날 때(정리 함수) 부른다.
 */
export function clearCushionDraft() {
  if (draft === null) return;
  draft = null;
  emit();
}
