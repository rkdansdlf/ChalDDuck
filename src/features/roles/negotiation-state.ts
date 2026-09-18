"use client";

import { useSyncExternalStore } from "react";
import type { RoleKey } from "@/lib/types";

/**
 * 역할 협의 상태.
 *
 * 조율 순서: **선호 확인 → 협의 → (필요하면) 추첨 → 당사자 수락 → 최종 확정**.
 * 거절은 오류가 아니라 남은 후보끼리 다시 추첨하는 정상 절차다.
 * 이 과정 어디에도 MBTI 는 쓰이지 않는다.
 *
 * 화면(`/team`)을 떠났다 돌아와도 추첨 결과가 사라지면 안 되므로 React 밖에 둔다.
 * 탭바 배지도 같은 스토어를 읽어 "확인이 필요한 역할 수"를 보여 준다.
 *
 * TODO(서버): 추첨과 수락/거절은 원래 팀원 모두가 같은 결과를 봐야 하는 서버 상태다.
 * 지금은 내 브라우저 안에서만 유지된다.
 */

/** 한 역할의 추첨 결과. `accepted` 가 true 여야 최종 확정이다. */
export type Resolution = {
  /** 어떤 도구로 뽑았는지 — 결과 화면에 "룰렛 결과"처럼 표시한다. */
  tool: string;
  winner: string;
  accepted: boolean;
};

type State = {
  resolutions: Partial<Record<RoleKey, Resolution>>;
  /** 역할별로 거절해서 다음 추첨에서 빠지는 사람들. */
  rejected: Partial<Record<RoleKey, string[]>>;
  /** 아직 확정되지 않은 겹친 역할 수 — 탭바 배지가 읽는다. */
  pendingCount: number;
};

const EMPTY: State = { resolutions: {}, rejected: {}, pendingCount: 0 };

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

/**
 * 추첨한다. 거절한 사람은 후보에서 뺀다.
 *
 * 전원이 거절해 후보가 비면 제외를 무시하고 전체에서 다시 뽑는다 —
 * 아무도 못 뽑는 상태로 막히는 것보다 낫다.
 * (거절 시 전원 재추첨으로 갈지는 아직 확정되지 않은 정책)
 *
 * @returns 뽑힌 사람 이름. 후보가 아예 없으면 `null`.
 */
export function drawFor(role: RoleKey, toolName: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  const excluded = state.rejected[role] ?? [];
  const remaining = candidates.filter((name) => !excluded.includes(name));
  const pool = remaining.length > 0 ? remaining : candidates;
  const winner = pool[Math.floor(Math.random() * pool.length)];

  set({
    ...state,
    resolutions: { ...state.resolutions, [role]: { tool: toolName, winner, accepted: false } },
  });
  return winner;
}

/** 당사자가 수락 — 여기서 비로소 확정된다. */
export function acceptDraw(role: RoleKey) {
  const current = state.resolutions[role];
  if (!current) return;
  set({
    ...state,
    resolutions: { ...state.resolutions, [role]: { ...current, accepted: true } },
  });
}

/** 당사자가 거절 — 제외 명단에 넣고 결과를 지워 다시 추첨할 수 있게 한다. */
export function rejectDraw(role: RoleKey): string | null {
  const current = state.resolutions[role];
  if (!current) return null;

  const resolutions = { ...state.resolutions };
  delete resolutions[role];

  set({
    ...state,
    resolutions,
    rejected: {
      ...state.rejected,
      [role]: [...(state.rejected[role] ?? []), current.winner],
    },
  });
  return current.winner;
}

/** 화면이 계산한 "확인이 필요한 역할 수"를 탭바와 공유한다. */
export function setPendingCount(count: number) {
  if (state.pendingCount !== count) set({ ...state, pendingCount: count });
}

export function useNegotiation() {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

export function usePendingTeamCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => state.pendingCount,
    () => 0,
  );
}
