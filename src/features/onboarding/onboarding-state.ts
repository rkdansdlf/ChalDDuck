"use client";

import { useSyncExternalStore } from "react";
import { EMPTY_PICKS, isMbtiType, picksToMbti, type MbtiType, type QuizPicks } from "@/lib/mbti";
import type { OnboardingDraft, RoleKey } from "@/lib/types";

/**
 * 온보딩 상태.
 *
 * 프로토타입은 `App` 최상위 `useState` 하나로 모든 화면을 이어 붙였지만, 실제 앱은 화면마다
 * URL 이 따로 있어서 라우팅을 건너도 값이 남아 있어야 한다. 그래서 React 밖의 작은 스토어 +
 * `sessionStorage` 로 옮기고 `useSyncExternalStore` 로 읽는다.
 *
 * `sessionStorage` 를 고른 이유: 아직 서버에 저장된 값이 아니고, 공용 PC 에 이름이
 * 남아 있을 이유도 없다. 탭을 닫으면 사라지는 게 맞다.
 *
 * 온보딩이 끝나 서버에 등록되면(`submitOnboarding`) `resetOnboarding()` 으로 비우고,
 * 그다음부터는 서버가 준 멤버 정보를 쓴다.
 */

const STORAGE_KEY = "cd.onboarding";

export type OnboardingState = {
  /** 입장하려는 팀의 초대 코드. */
  teamCode: string | null;
  name: string;
  /** 직접 고른 유형. 30초 컷 결과는 `picks` 에서 따로 환산한다. */
  mbti: MbtiType | null;
  picks: QuizPicks;
  want: RoleKey | null;
  veto: RoleKey | null;
};

const EMPTY: OnboardingState = {
  teamCode: null,
  name: "",
  mbti: null,
  picks: EMPTY_PICKS,
  want: null,
  veto: null,
};

let state: OnboardingState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function load(): OnboardingState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw) as Partial<OnboardingState>;
    return {
      teamCode: typeof saved.teamCode === "string" ? saved.teamCode : null,
      name: typeof saved.name === "string" ? saved.name : "",
      mbti: isMbtiType(saved.mbti) ? saved.mbti : null,
      picks:
        Array.isArray(saved.picks) && saved.picks.length === 4
          ? (saved.picks as QuizPicks)
          : EMPTY_PICKS,
      want: saved.want ?? null,
      veto: saved.veto ?? null,
    };
  } catch {
    // 저장된 값이 깨졌거나 저장소 접근이 막힌 경우 — 빈 상태로 시작한다
    return EMPTY;
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장이 막혀도 이번 세션 안에서는 메모리 상태로 계속 동작한다
  }
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  // 첫 구독(= 첫 마운트) 때 저장된 값을 복원한다. 서버 렌더는 항상 EMPTY 를 쓰므로
  // 하이드레이션이 어긋나지 않고, 복원 직후 React 가 스냅샷을 다시 읽어 간다.
  if (!hydrated) {
    hydrated = true;
    state = load();
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function update(patch: Partial<OnboardingState>) {
  state = { ...state, ...patch };
  persist();
  emit();
}

export function setTeamCode(teamCode: string | null) {
  if (state.teamCode !== teamCode) update({ teamCode });
}
export function setName(name: string) {
  update({ name });
}
export function setMbti(mbti: MbtiType | null) {
  update({ mbti });
}
export function setWant(want: RoleKey | null) {
  update({ want });
}
export function setVeto(veto: RoleKey | null) {
  update({ veto });
}

export function setPick(index: number, pick: "a" | "b") {
  const picks = [...state.picks] as QuizPicks;
  picks[index] = pick;
  update({ picks });
}

/** 30초 컷으로 들어갈 때 직접 고른 값을 비운다(프로토타입의 `go("quiz")` 동작). */
export function startQuiz() {
  update({ mbti: null });
}

export function resetOnboarding() {
  update(EMPTY);
}

/** 서버로 보낼 형태. */
export function toDraft(): OnboardingDraft {
  return {
    name: state.name.trim(),
    mbti: state.mbti ?? picksToMbti(state.picks),
    mbtiFromQuiz: !state.mbti && picksToMbti(state.picks) !== null,
    want: state.want,
    veto: state.veto,
  };
}

export function useOnboarding() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );

  const quizResult = picksToMbti(current.picks);

  return {
    ...current,
    /** 직접 고른 값이 있으면 그것, 없으면 30초 컷 결과. */
    effectiveMbti: current.mbti ?? quizResult,
    /** 지금 유형이 30초 컷에서 나온 것인지 — 05 화면 문구가 달라진다. */
    fromQuiz: !current.mbti && quizResult !== null,
    /** 30초 컷에서 답한 문항 수. */
    answeredCount: current.picks.filter(Boolean).length,
  };
}
