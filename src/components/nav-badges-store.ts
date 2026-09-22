"use client";

import { useSyncExternalStore } from "react";
import type { NavBadges } from "@/server/nav/badges";

/**
 * 다시 세어 온 배지 숫자를 담아 두는 곳.
 *
 * 왜 필요한가: `AppNav` 는 한 화면에 **두 번** 그려진다 — 좁은 화면의 하단 탭바와 넓은
 * 화면의 세로 막대. 둘 다 CSS 로만 숨어 있어서 항상 붙어 있다. 각자 서버에 물어보면
 * 같은 숫자를 위해 요청이 두 배로 나가고, 응답이 엇갈리는 순간에는 탭바와 세로 막대가
 * 서로 다른 숫자를 보여 준다.
 *
 * 그래서 **한쪽만 묻고 둘 다 여기서 읽는다.** `messages-state` 와 같은 방식이다.
 */
let current: NavBadges | null = null;
const listeners = new Set<() => void>();

export function setNavBadges(next: NavBadges) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * 아직 한 번도 세어 오지 않았으면 `null` — 그때는 서버가 그려 준 첫 숫자를 쓴다.
 *
 * 서버 렌더에서도 `null` 이어야 한다. 서버에는 이 값이 없으므로, 다른 것을 돌려주면
 * 하이드레이션에서 화면이 한 번 어긋난다.
 */
export function useNavBadges(): NavBadges | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
