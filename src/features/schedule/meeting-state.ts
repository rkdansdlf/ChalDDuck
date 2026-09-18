"use client";

import { useSyncExternalStore } from "react";
import type { MeetingSlot } from "@/lib/types";

/**
 * 회의 제안 상태.
 *
 * 확정 규칙: **특정 한 사람이 단독으로 확정하지 않는다.** 후보를 제안하면 응답 마감까지
 * 반대가 없을 때 자동으로 확정되고, 누구든 반대하면 확정되지 않는다.
 *
 * 화면 지역 상태로 두면 탭을 옮기는 순간 제안이 사라지고, 홈(11)도 "회의 제안에 응답"을
 * 알 수 없다. 그래서 React 밖에 둔다.
 *
 * TODO(서버): 제안·응답·마감은 원래 팀원 모두가 같은 값을 보는 서버 상태다.
 * 지금은 내 브라우저 안에서만 유지된다.
 */

/**
 * - `idle` 후보를 고르는 중
 * - `proposed` 제안을 보내고 응답을 기다리는 중
 * - `confirmed` 응답 마감까지 반대가 없어 확정
 * - `carried` 이번 주를 건너뛰고 다음 주로 이월(전원 불가한 주에서만)
 */
export type MeetingStage = "idle" | "proposed" | "confirmed" | "carried";

type State = {
  stage: MeetingStage;
  /** 제안한 후보. 홈이 요일·시간을 그대로 쓰기 위해 통째로 들고 있는다. */
  slot: MeetingSlot | null;
};

const EMPTY: State = { stage: "idle", slot: null };

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

export function proposeMeeting(slot: MeetingSlot) {
  set({ stage: "proposed", slot });
}

/** 응답 마감까지 반대가 없었을 때. 서버가 하는 일이라 화면에서는 데모로만 부른다. */
export function confirmMeeting() {
  if (state.stage === "proposed") set({ ...state, stage: "confirmed" });
}

/** 누군가 반대했다 — 제안이 취소되고 다시 후보를 고르는 상태로 돌아간다. */
export function objectToMeeting() {
  set(EMPTY);
}

/** 전원 불가한 주를 건너뛰고 다음 주로 넘긴다. */
export function carryOverMeeting() {
  set({ stage: "carried", slot: null });
}

export function useMeeting(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

/** 일정 탭 배지 — 내 응답을 기다리는 제안이 있으면 1건. */
export function usePendingScheduleCount(): number {
  return useSyncExternalStore(
    subscribe,
    () => (state.stage === "proposed" ? 1 : 0),
    () => 0,
  );
}
