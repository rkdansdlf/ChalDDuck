import type {
  AiTool,
  BusyBlock,
  ChatMessage,
  DmThread,
  BusyKind,
  DriveLimits,
  FileVersion,
  Member,
  MeetingWeek,
  OnboardingDraft,
  QuizQuestion,
  RandomTool,
  RecentItem,
  Role,
  SubmissionBox,
  Team,
} from "@/lib/types";
import {
  AI_TOOLS,
  BOX_VERSIONS,
  DM_MESSAGES,
  DM_THREADS,
  BUSY_KINDS,
  DRIVE_LIMITS,
  MEETING_SLOTS,
  MEETING_SLOTS_PARTIAL,
  MOCK_ROSTER,
  MOCK_TEAM,
  MY_BUSY_BLOCKS,
  QUIZ,
  RECENT_ITEMS,
  RANDOM_TOOLS,
  ROLES,
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  SUBMISSION_BOXES,
  TEAM_MESSAGES,
} from "./mock";

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

export async function getRandomTools(): Promise<RandomTool[]> {
  return RANDOM_TOOLS;
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

/* ── 08 내 가능한 시간 ─────────────────────────────────────── */

/** 시간표 화면이 필요한 고정 값들 — 사유 종류·요일·시간대. */
export async function getScheduleOptions(): Promise<{
  kinds: BusyKind[];
  days: string[];
  hours: string[];
}> {
  return { kinds: BUSY_KINDS, days: SCHEDULE_DAYS, hours: SCHEDULE_HOURS };
}

export async function getMyBusyBlocks(_teamId: string): Promise<BusyBlock[]> {
  return MY_BUSY_BLOCKS;
}

/**
 * 내 시간표를 저장한다.
 *
 * TODO(서버): 실제로는 저장 후 팀의 회의 시간 후보가 다시 계산된다.
 * 지금은 아무것도 저장하지 않고 성공만 돌려준다.
 */
export async function saveMyBusyBlocks(_teamId: string, _blocks: BusyBlock[]): Promise<{ ok: true }> {
  return { ok: true };
}

/* ── 09 / 10 회의 시간 ─────────────────────────────────────── */

/**
 * 이번 주 회의 시간 후보.
 *
 * 전원 가능한 후보가 없으면 `hasFullAvailability` 가 false 가 되고,
 * 화면은 10번(전원 불가한 주) 흐름으로 바뀐다.
 *
 * `preview` 는 **데모 전용**이다. 서버가 붙으면 실제 시간표로만 판단하므로 없앤다.
 */
export async function getMeetingWeek(
  _teamId: string,
  preview?: "none",
): Promise<MeetingWeek> {
  const slots = preview === "none" ? MEETING_SLOTS_PARTIAL : MEETING_SLOTS;
  return {
    slots,
    hasFullAvailability: slots.some((s) => s.available === s.total),
    submitted: MOCK_ROSTER.length,
    total: MOCK_ROSTER.length,
  };
}

/* ── 11 홈 ─────────────────────────────────────────────────── */

export async function getAiTools(): Promise<AiTool[]> {
  return AI_TOOLS;
}

export async function getRecentItems(_teamId: string): Promise<RecentItem[]> {
  return RECENT_ITEMS;
}

/* ── 12 / 13 / 22 드라이브 ──────────────────────────────────── */

export async function getDriveLimits(_teamId: string): Promise<DriveLimits> {
  return DRIVE_LIMITS;
}

export async function getSubmissionBoxes(_teamId: string): Promise<SubmissionBox[]> {
  return SUBMISSION_BOXES;
}

export async function getSubmissionBox(
  _teamId: string,
  boxId: string,
): Promise<SubmissionBox | null> {
  return SUBMISSION_BOXES.find((b) => b.id === boxId) ?? null;
}

/** 버전 기록. **맨 앞이 최신**이다. */
export async function getFileVersions(_teamId: string, boxId: string): Promise<FileVersion[]> {
  return BOX_VERSIONS[boxId] ?? [];
}

/* ── 19 / 30 / 31 / 32 채팅 ─────────────────────────────────── */

export async function getTeamMessages(_teamId: string): Promise<ChatMessage[]> {
  return TEAM_MESSAGES;
}

export async function getDmThreads(_teamId: string): Promise<DmThread[]> {
  return DM_THREADS;
}

export async function getDmThread(_teamId: string, threadId: string): Promise<DmThread | null> {
  return DM_THREADS.find((t) => t.id === threadId) ?? null;
}

export async function getDmMessages(_teamId: string, threadId: string): Promise<ChatMessage[]> {
  return DM_MESSAGES[threadId] ?? [];
}

/**
 * 데모에서 메시지 전송이 실패할 확률.
 *
 * 전송 실패와 "다시 보내기"는 설계에 있는 상태인데, 목 구현이 항상 성공하면
 * 그 화면을 볼 방법이 없다. 그래서 **목 구현 안에서만** 가끔 실패시킨다 —
 * 화면 코드는 서버가 붙은 뒤와 똑같이 결과만 보고 판단한다.
 *
 * 실제 API 를 붙일 때 이 상수는 목 구현과 함께 사라진다.
 */
const DEMO_SEND_FAILURE_RATE = 0.25;

/** 메시지를 보낸다. 실패하면 화면이 "전송 실패 · 다시 보내기"를 보여 준다. */
export async function sendChatMessage(
  _threadId: string,
  _text: string,
): Promise<{ ok: boolean }> {
  return { ok: Math.random() >= DEMO_SEND_FAILURE_RATE };
}
