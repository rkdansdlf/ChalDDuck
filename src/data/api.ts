import type { Member, OnboardingDraft, QuizQuestion, Role, Team } from "@/lib/types";
import { MOCK_ROSTER, MOCK_TEAM, QUIZ, ROLES } from "./mock";

/**
 * 데이터 접근 계층.
 *
 * 지금은 전부 목 데이터를 돌려주지만, 화면은 **이 모듈만** 통해 데이터를 읽는다.
 * 서버가 붙으면 아래 함수 본문을 `fetch` 로 갈아끼우는 것으로 끝나야 한다 —
 * 화면 코드에서 `MOCK_*` 를 직접 import 하지 말 것.
 *
 * 모든 함수가 `async` 인 것도 같은 이유다. 지금 동기로 두면 나중에 모든 호출부를 고쳐야 한다.
 */

/** 초대 코드로 팀을 찾는다. 없는 코드면 `null`. */
export async function getTeamByCode(code: string): Promise<Team | null> {
  return code.toUpperCase() === MOCK_TEAM.code ? MOCK_TEAM : null;
}

/** 초대 링크 없이 들어왔을 때 보여 줄 기본 팀(데모 전용). */
export async function getDemoTeam(): Promise<Team> {
  return MOCK_TEAM;
}

export async function getRoles(): Promise<Role[]> {
  return ROLES;
}

export async function getQuiz(): Promise<QuizQuestion[]> {
  return QUIZ;
}

export async function getRoster(_teamId: string): Promise<Member[]> {
  return MOCK_ROSTER;
}

/**
 * 같은 초대 코드에 같은 이름의 기록이 이미 있는지 확인한다.
 *
 * 재입장·기기 변경 시 기록을 잇기 위한 것이다. 동명이인 구분 방법은
 * **아직 확정되지 않은 정책**이라(핸드오프 표 1행) 지금은 이름만으로 판단한다.
 */
export async function findExistingMember(teamId: string, name: string): Promise<Member | null> {
  const roster = await getRoster(teamId);
  const target = name.trim();
  return roster.find((m) => !m.isMe && m.name === target) ?? null;
}

/** 팀 만들기 — 서버가 초대 코드를 발급한다. 지금은 데모 코드를 그대로 돌려준다. */
export async function createTeam(input: { name: string; course: string }): Promise<Team> {
  return {
    ...MOCK_TEAM,
    id: "team_new",
    name: input.name.trim(),
    course: input.course.trim(),
    memberCount: 1,
    dday: null,
  };
}

/**
 * 온보딩 입력을 팀에 등록한다.
 *
 * TODO(서버): 실제로는 이 호출이 멤버를 만들고 세션을 발급한다.
 * 지금은 아무것도 저장하지 않고 성공만 돌려준다.
 */
export async function submitOnboarding(
  _teamId: string,
  _draft: OnboardingDraft,
): Promise<{ ok: true }> {
  return { ok: true };
}
