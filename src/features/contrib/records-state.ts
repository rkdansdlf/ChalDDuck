"use client";

import { useSyncExternalStore } from "react";
import type { ContribKindKey, ContribRecord, TeamCheckRecord } from "@/lib/types";

/**
 * 기여 기록 상태.
 *
 * 23(추가·정정) 화면에서 한 일이 16·17·18 에 모두 반영돼야 한다 — 기록을 하나 넣었는데
 * 리포트의 건수가 그대로면 무엇을 믿어야 할지 알 수 없다. 그래서 React 밖에 둔다.
 *
 * TODO(서버): 기록과 확인 상태는 원래 팀원 모두가 같은 값을 보는 서버 상태다.
 * 지금은 내 브라우저 안에서만 유지된다.
 */

type State = {
  /** 23 에서 내가 직접 넣은 기록. */
  added: ContribRecord[];
  /** 정정에 응답한 팀 기록 — id → 어떻게 정리했는지. */
  resolved: Record<string, string>;
};

const EMPTY: State = { added: [], resolved: {} };

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

let recordSeq = 0;

/**
 * 앱 밖에서 한 일을 기록에 넣는다.
 *
 * **`pending` 으로 들어간다.** 본인이 넣은 기록이 바로 확정되면 기록이 근거가 되지 못한다 —
 * 팀원 확인을 거쳐야 `ok` 가 된다.
 */
export function addContribRecord(input: {
  kind: ContribKindKey;
  title: string;
  hasEvidence: boolean;
}): ContribRecord {
  const created: ContribRecord = {
    id: `local-${(recordSeq += 1)}`,
    kind: input.kind,
    title: input.title,
    detail: `직접 추가한 기록${input.hasEvidence ? " · 근거 첨부됨" : ""}`,
    when: "방금",
    source: "self",
    state: "pending",
  };

  set({ ...state, added: [...state.added, created] });
  return created;
}

/** 의견 차이에 응답한다. `way` 가 그대로 확인 문구가 된다. */
export function resolveTeamCheck(id: string, way: string) {
  set({ ...state, resolved: { ...state.resolved, [id]: way } });
}

/** 서버 기록 뒤에 이 세션에서 넣은 기록을 이어 붙인다. */
export function useMyContrib(fromServer: ContribRecord[]): ContribRecord[] {
  const added = useSyncExternalStore(
    subscribe,
    () => state.added,
    () => EMPTY.added,
  );
  return added.length > 0 ? [...fromServer, ...added] : fromServer;
}

/** 정정에 응답한 항목은 확인 완료로 바뀌고 의견은 지워진다. */
export function useTeamCheck(fromServer: TeamCheckRecord[]): TeamCheckRecord[] {
  const resolved = useSyncExternalStore(
    subscribe,
    () => state.resolved,
    () => EMPTY.resolved,
  );

  return fromServer.map((record) => {
    const way = resolved[record.id];
    return way ? { ...record, state: "ok" as const, by: way, dispute: null } : record;
  });
}

/** 팀 탭 배지에 더할, 내 확인이 필요한 기여 항목 수. */
export function usePendingContribCount(myRecords: ContribRecord[]): number {
  return myRecords.filter((r) => r.state === "pending").length;
}
