"use client";

import { useSyncExternalStore } from "react";
import { isMbtiType, type MbtiType } from "@/lib/mbti";
import { EMPTY_PICKS, QUIZ_QUESTIONS, picksToMbti, type QuizPick, type QuizPicks } from "@/lib/mbti-quiz";
import { normalizeName } from "@/features/roles/roster-model";
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
  email: string;
  /** 직접 고른 유형. 04 성향 체크 결과는 `picks` 에서 따로 환산한다. */
  mbti: MbtiType | null;
  /** 04 화면의 답 — 문항 id 기준. 순서가 바뀌어도 답이 섞이지 않는다. */
  picks: QuizPicks;
  want: RoleKey | null;
  veto: RoleKey | null;
};

const EMPTY: OnboardingState = {
  teamCode: null,
  name: "",
  email: "",
  mbti: null,
  picks: EMPTY_PICKS,
  want: null,
  veto: null,
};

let state: OnboardingState = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

/** 깨진 값을 골라 낸다 — 답은 `"a" | "b"` 만 인정한다. */
function sanitizePicks(value: unknown): QuizPicks {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return EMPTY_PICKS;
  const out: QuizPicks = {};
  for (const [id, pick] of Object.entries(value as Record<string, unknown>)) {
    if (pick === "a" || pick === "b") out[id] = pick;
  }
  return out;
}

/**
 * 저장소에 들어 있는 초안을 읽는다. **아무것도 없으면 `null`.**
 *
 * 빈 상태(`EMPTY`)와 "아무것도 없다" 를 구분해야 한다. 예전에는 둘을 구분하지 않고 빈 상태를
 * 그대로 썼는데, 그래서 그 위에 이미 만들어 둔 최신 상태(예: `/join` 이 심어 둔 팀 코드)를
 * 덮어 버렸다. 저장이 막힌 기기(시크릿 모드·저장소 차단·용량 소진)에서는 언제나 이 경로가
 * 타는데, 그때 이름 조회가 늘 실패해 온보딩 전체가 마지막에 조용히 막혔다.
 *
 * 깨진 값은 **버리지 않고 남겨 둔 채** 덮어쓴다 — 값 하나가 이상하다고 팀 코드까지 잃으면
 * 사용자는 처음부터 다시 적어야 한다. 이상한 값만 각각의 기본값으로 되돌린다.
 */
function loadStored(): OnboardingState | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let saved: Partial<OnboardingState>;
  try {
    saved = JSON.parse(raw) as Partial<OnboardingState>;
  } catch {
    return null;
  }

  return {
    teamCode: typeof saved.teamCode === "string" ? saved.teamCode : null,
    name: typeof saved.name === "string" ? saved.name : "",
    email: typeof saved.email === "string" ? saved.email : "",
    mbti: isMbtiType(saved.mbti) ? saved.mbti : null,
    picks: sanitizePicks(saved.picks),
    want: (saved.want ?? null) as OnboardingState["want"],
    veto: (saved.veto ?? null) as OnboardingState["veto"],
  };
}

/** 저장소에 쓴다. 막혀도 조용히 넘어간다 — 이번 세션 안에서는 메모리로 계속 동작한다. */
function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 그 사실을 기억할 필요는 없다. `loadStored()` 가 못 읽으면 `null` 로 말하고, 구독은
    // 그때 상태를 건드리지 않는다.
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
    // **저장된 것이 있을 때만** 덮어쓴다. 저장이 막힌 기기(시크릿 모드·저장소 차단·용량
    // 소진)에서는 아무것도 못 읽는다. 예전에는 여기서 빈 상태를 그대로 써서, 그 위에 이미
    // 만들어 둔 팀 코드를 지웠다 — 이름 조회가 늘 실패하고 온보딩 전체가 마지막에 조용히
    // 막혔다. 돌아갈 최신 상태가 있는데 비워 버릴 이유가 없다.
    const stored = loadStored();
    if (stored) state = { ...state, ...stored };
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
export function setEmail(email: string) {
  update({ email });
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

export function setPick(id: string, pick: Exclude<QuizPick, null>) {
  update({ picks: { ...state.picks, [id]: pick } });
}

/**
 * 04 성향 체크로 들어갈 때 직접 고른 값을 비운다(프로토타입의 `go("quiz")` 동작).
 *
 * **답도 함께 비운다.** 예전에는 `mbti` 만 지워서, 전에 답해 둔 4문항이 남아 있었다.
 * 다시 03 화면에서 "성향 체크"를 눌러도 전부 체크된 채 "INFP 로 계속" 이 떠 있었고,
 * 거기서 "MBTI 없이 계속하기" 를 눌러도 그 답이 그대로 저장됐다 — 사용자가 하지 않기로
 * 고른 MBTI 를 고른 쪽에서 사다.
 */
export function startQuiz() {
  update({ mbti: null, picks: EMPTY_PICKS });
}

/**
 * 온보딩 초안을 비운다. **서버에 등록된 직후에 부른다.**
 *
 * 예전에는 이 함수를 아무 곳에서도 부르지 않았다(`submitOnboarding` 이라는 함수도 없다).
 * 그래서 팀을 옮겨도 남은 이름·MBTI·희망 역할이 새 팀 명단 위에 덮여 그려졌고,
 * 07 화면은 서버가 준 당첨자 이름을 로컬 이름과 비교해 수락·거절 버튼을 아예 띄우지
 * 않았다. 공용 PC 에 이름이 남을 이유도 없으므로 끝나면 반드시 비운다.
 */
export function resetOnboarding() {
  update(EMPTY);
}

/** 서버로 보낼 형태. */
export function toDraft(): OnboardingDraft {
  const emailNorm = state.email.trim().toLowerCase();
  return {
    name: normalizeName(state.name),
    email: emailNorm || null,
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
    /** 직접 고른 값이 있으면 그것, 없으면 04 성향 체크 결과. */
    effectiveMbti: current.mbti ?? quizResult,
    /** 지금 유형이 04 성향 체크에서 나온 것인지 — 05 화면 문구가 달라진다. */
    fromQuiz: !current.mbti && quizResult !== null,
    /** 04 화면에서 답한 문항 수. */
    answeredCount: Object.keys(QUIZ_QUESTIONS).filter((id) => current.picks[id]).length,
  };
}
