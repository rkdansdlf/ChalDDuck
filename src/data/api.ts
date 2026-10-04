import "server-only";

import { redirect } from "next/navigation";
import type { MbtiType } from "@/lib/mbti";
import { isMbtiType } from "@/lib/mbti";
import type { QuizQuestion } from "@/lib/mbti-quiz";
import { QUIZ_QUESTIONS } from "@/lib/mbti-quiz";
import { resolveReadPolicy } from "@/server/ai/purify-policy";
import { lastMessagePerThread } from "./last-message";
import { acceptedRoleAssignments } from "./accepted-roles";
import { formatDeadline, formatDue, formatWhen, toKstInputValue } from "@/lib/when";
import { TEAM_CAP_BYTES, isLateVersion } from "@/features/drive/file-rules";
import { teamUsedBytes } from "@/server/drive/usage";
import { canEditTask, taskEditBlock } from "@/lib/task-permission";
import { countUnresolved } from "@/server/rate-limit/join-throttle";
import { isJoinCapped } from "@/server/rate-limit/policy";
import type {
  AiPolicy,
  AiTool,
  AppNotification,
  BusyBlock,
  BusyKind,
  CalendarEvent,
  ChatMessage,
  ChatPurified,
  CushionLevelKey,
  ContribKind,
  ContribRecord,
  CushionTone,
  DmThread,
  DriveLimits,
  FileKind,
  FileVersion,
  IceGame,
  IceView,
  Member,
  MeetingNote,
  MeetingProposal,
  MeetingWeek,
  PresentDraft,
  RandomTool,
  RecentItem,
  ResearchResult,
  Role,
  RoleKey,
  RoleNegotiation,
  SentenceMode,
  SubmissionBox,
  SubmittedFile,
  Task,
  TaskKind,
  Team,
  ScheduleWeek,
  TeamCheckRecord,
  TeamTimetable,
} from "@/lib/types";
import { TASKS_RECENT_ID } from "@/lib/types";
import { humanSize } from "@/features/drive/file-rules";
import { effectiveStage } from "@/features/schedule/meeting-model";
import {
  candidateDates,
  scheduleWeeks,
  weekName,
  todayInSeoul,
  weekRange,
  type CandidateDate,
} from "@/features/schedule/week";
import { calcDday, normalizeTaskDueDate, sortCalendarEvents } from "@/features/schedule/calendar-events";
import { candidateDateOf } from "@/server/meetings/candidates";
import { isAiConfigured } from "@/server/ai/model";
import { db } from "@/server/db";
import { iceViewFor } from "@/server/ice/view";
import { askedTodayBy } from "@/server/meetings/schedule-ask";
import { normalizeName } from "@/features/roles/roster-model";
import { currentSessionToken, deviceIdOf, getSessionMember } from "@/server/session";
import { notificationsFor } from "@/server/notify/inbox";
import { pushConfigured } from "@/server/notify/push";
import { READ_CUSHION_DEFAULT, isCushionTone, levelOf, type ReadCushionSetting } from "@/lib/read-cushion";
import { confirmsPolicy, teamCheckRecords } from "@/server/contrib/team-check";
import {
  AI_POLICY,
  AI_TOOLS,
  BUSY_KINDS,
  CLERK_SAMPLE_INPUT,
  CUSTOM_BUSY_KIND,
  CONTRIB_KINDS,
  CUSHION_SAMPLE_INPUT,
  CUSHION_SAMPLE_OUTPUT,
  CUSHION_TONES,
  ICE_GAMES,
  MENU_OPTIONS,
  PRESENT_SAMPLE_DRAFT,
  PRESENT_SAMPLE_INPUT,
  RANDOM_TOOLS,
  RESEARCH_SAMPLE_QUERY,
  RESEARCH_SAMPLE_RESULTS,
  ROLES,
  SCHEDULE_DAYS,
  SCHEDULE_HOURS,
  SENTENCE_MODES,
  SENTENCE_SAMPLE_INPUT,
  SENTENCE_SAMPLE_OUTPUT,
  TASK_KINDS,
} from "./catalog";

/**
 * 데이터 접근 계층.
 *
 * 화면은 **이 모듈만** 통해 데이터를 읽는다. Prisma 클라이언트를 화면에서 직접 부르지 말 것 —
 * 그러면 DB 행 모양이 화면까지 새어 들어와 스키마를 고칠 때마다 화면을 따라 고쳐야 한다.
 * 여기서 도메인 타입(`src/lib/types.ts`)으로 한 번 번역한다.
 *
 * 읽기만 있다. 쓰기는 `src/server/actions/` 의 서버 액션이 맡는다.
 */

/* ── 세션·팀 ────────────────────────────────────────────────── */

/** 지금 사용자가 속한 팀. 세션이 없으면 초대 입장 화면으로 보낸다. */
export async function getCurrentTeam(): Promise<Team> {
  const member = await getSessionMember();
  if (!member) redirect("/join");

  const team = await db.team.findUnique({
    where: { id: member.teamId },
    include: { _count: { select: { members: { where: ACTIVE } } } },
  });
  if (!team) redirect("/join");

  return {
    id: team.id,
    name: team.name,
    course: team.course,
    code: team.code,
    memberCount: team._count.members,
    dday: team.dday,
  };
}

/** 초대 코드로 팀을 찾는다. 없는 코드면 `null`. 세션이 없어도 쓸 수 있다. */
export async function getTeamByCode(code: string): Promise<Team | null> {
  const team = await db.team.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { _count: { select: { members: { where: ACTIVE } } } },
  });
  if (!team) return null;

  return {
    id: team.id,
    name: team.name,
    course: team.course,
    code: team.code,
    memberCount: team._count.members,
    dday: team.dday,
  };
}

/**
 * 지금 팀에 있는 사람만.
 *
 * 나간 사람의 `Member` 행은 남는다 — 기여 기록·메시지·파일 이력이 성적 근거라
 * 지우면 팀 기록에 구멍이 난다. 대신 명단과 집계에서는 빠진다.
 */
const ACTIVE = { leftAt: null } as const;

const toMbti = (value: string | null | undefined): MbtiType | null =>
  isMbtiType(value) ? value : null;
const toRole = (value: string | null): RoleKey | null => (value as RoleKey | null) ?? null;

export async function getRoster(teamId: string): Promise<Member[]> {
  const session = await getSessionMember();
  const members = await db.member.findMany({
    where: { teamId, ...ACTIVE },
    orderBy: { joinedAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    name: m.name,
    isMe: m.id === session?.id,
    mbti: toMbti(m.mbti),
    want: toRole(m.wantRole),
    veto: toRole(m.vetoRole),
  }));
}

/**
 * 같은 팀에 같은 이름의 기록이 이미 있는지 확인한다.
 *
 * 재입장·기기 변경 시 기록을 잇기 위한 것이다. 동명이인 구분 방법은
 * **아직 확정되지 않은 정책**이라 지금은 이름만으로 판단한다.
 */
export async function findExistingMember(teamCode: string, name: string): Promise<Member | null> {
  const team = await getTeamByCode(teamCode);
  if (!team) return null;

  const member = await db.member.findUnique({
    where: { teamId_name: { teamId: team.id, name: normalizeName(name) } },
  });
  if (!member) return null;

  return {
    id: member.id,
    name: member.name,
    isMe: false,
    mbti: toMbti(member.mbti),
    want: toRole(member.wantRole),
    veto: toRole(member.vetoRole),
  };
}

/* ── 제품 설정 (팀마다 달라지지 않는 값) ───────────────────── */

export async function getRoles(): Promise<Role[]> {
  return ROLES;
}
export async function getQuiz(): Promise<QuizQuestion[]> {
  return QUIZ_QUESTIONS;
}
export async function getRandomTools(): Promise<RandomTool[]> {
  return RANDOM_TOOLS;
}
export async function getContribKinds(): Promise<ContribKind[]> {
  return CONTRIB_KINDS;
}
export async function getTaskKinds(): Promise<TaskKind[]> {
  return TASK_KINDS;
}
export async function getIceGames(): Promise<IceGame[]> {
  return ICE_GAMES;
}
/** 진행 중인 아이스브레이킹 판을 내 눈으로 본 모습. 없으면 null. */
export async function getIceView(): Promise<IceView | null> {
  const session = await getSessionMember();
  return session ? iceViewFor(session) : null;
}

/**
 * 이번 판에 **앉을 사람을 고르는** 목록. 팀에 남아 있는 사람 전부.
 *
 * 예전에는 서버가 팀원 전원을 자동으로 앉혔다 — 오늘 회의에 오지 않은 사람이 라이어가 되는
 * 일이 실제로 났기 때문에, 고르는 것으로 바꿨다.
 */
export async function getIceRoster(): Promise<{ id: string; name: string }[]> {
  const session = await getSessionMember();
  if (!session) return [];
  return db.member.findMany({
    where: { teamId: session.teamId, leftAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function getMenuOptions(_teamId: string): Promise<string[]> {
  return MENU_OPTIONS;
}

/**
 * 팀이 정한 밥과 **무엇으로** 정했는지. 없으면 아직 아무도 돌리지 않았다.
 *
 * 이 값을 화면에 내려야 하는 이유: **각자 돌리면 각자 다른 값이 나온다.** 예전에는
 * 서버를 부르지 않고 폰에서만 `Math.random()` 을 돌렸고, 새로고침하면 값이 바뀌었다.
 *
 * 도구(`tool`)도 결과와 짝으로 내려간다. 결과를 하나만 두고 도구를 빼면 팀원마다 "그건
 * 뭘로 뽑힌 거지"가 달라지고, 이 화면이 약속한 "팀에 하나"가 도구 자리에서 어긋난다.
 */
export async function getMenuDraw(
  teamId: string,
): Promise<{ pick: string | null; tool: string | null }> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { menuPick: true, menuTool: true },
  });
  return { pick: team?.menuPick ?? null, tool: team?.menuTool ?? null };
}
export async function getScheduleOptions(): Promise<{
  kinds: BusyKind[];
  /** 직접 입력 사유의 색·대체 이름. 칩에는 본인이 붙인 이름이 보인다. */
  customKind: BusyKind;
  days: string[];
  hours: string[];
  /** 고를 수 있는 주. 첫 주(오늘이 속한 주)가 기본이다. */
  weeks: ScheduleWeek[];
  /** 회의 후보·제안을 받는 날 — 오늘부터 7일. */
  candidateDays: CandidateDate[];
}> {
  return {
    kinds: BUSY_KINDS,
    customKind: CUSTOM_BUSY_KIND,
    days: SCHEDULE_DAYS,
    hours: SCHEDULE_HOURS,
    weeks: scheduleWeeks().map((key) => ({ key, name: weekName(key), range: weekRange(key) })),
    candidateDays: candidateDates(),
  };
}

/* ── 07 역할 조율 ───────────────────────────────────────────── */

/**
 * 팀의 **확정된** 역할 배정 — 사람 하나가 맡은 역할들.
 *
 * 계산은 `data/accepted-roles.ts` 한 곳에 있다(`acceptedRoleAssignments`) — 규칙과 그 근거는
 * 거기 적어 두었고, 그 파일이 순수 조회만이라 `scripts/smoke.mts` 가 이 불변식을 직접 돌릴
 * 수 있다. 여기서는 화면에 넘길 형태로 감싼다.
 *
 * **희망(`Member.wantRole`)으로 대신 채우지 않는다.** 역할이 없으면 키가 없다.
 */
export async function getAcceptedRoleAssignments(
  teamId: string,
): Promise<Map<string, RoleKey[]>> {
  return acceptedRoleAssignments(db, teamId, ROLES.map((r) => r.key as string));
}

/** 팀의 역할 추첨 현황. 07 화면과 탭 배지가 같은 값을 본다. */
export async function getRoleNegotiation(teamId: string): Promise<RoleNegotiation> {
  const [draws, rejections, consents, members, session] = await Promise.all([
    db.roleDraw.findMany({
      where: { teamId },
      include: { winner: { select: { id: true, name: true, leftAt: true } } },
    }),
    db.roleRejection.findMany({
      where: { teamId },
      include: { member: { select: { name: true } } },
    }),
    // 동의 제안은 **마감을 지나도 행이 남는다** — 팀이 동의한 도구가 계속 쓰여야 하므로.
    // 살아 있는지만 여기서 보지 않는다(읽을 때마다 시각으로 계산한다).
    db.roleDrawConsent.findMany({
      where: { teamId },
      include: {
        proposedBy: { select: { id: true, name: true } },
        responses: { select: { memberId: true, agree: true } },
      },
    }),
    // 배지와 "몇 명이 응답해야 하는지" 를 말하려면 팀 전체 인원이 필요하다. 나간 사람은 뺀다.
    db.member.findMany({ where: { teamId, leftAt: null }, select: { id: true } }),
    // **내가 동의했는지** — 화면이 자기 응답 버튼을 숨기려면 판정자가 있어야 한다.
    getSessionMember(),
  ]);

  const result: RoleNegotiation = { draws: {}, rejected: {}, consents: {} };

  for (const d of draws) {
    result.draws[d.role as RoleKey] = {
      tool: d.tool,
      winner: d.winner.name,
      // 이름은 고칠 수 있으므로 판은 id 로 한다 — 서버(`actions/roles`)와 같은 기준.
      winnerId: d.winnerId,
      accepted: d.accepted,
      // **행을 지우지 않는다.** 조회가 부수효과를 가지면 언제 지워졌는지 예측할 수
      // 없다. 무효로 보이는 것만 알리고, 실제 정리는 `drawForRole` 이 "다시 뽑는다" 는
      // 맥락에서 한다.
      stale: d.winner.leftAt !== null,
    };
  }
  for (const r of rejections) {
    const role = r.role as RoleKey;
    result.rejected[role] = [...(result.rejected[role] ?? []), r.member.name];
  }
  for (const c of consents) {
    // **반대는 저장되지 않는다**(제안이 지워진다). 그래도 `agree: false` 가 들어오면
    // 카운트에서 빼 둔다 — 나중에 반대를 저장하는 방식으로 바꿔도 이 조회가 그대로 맞는다.
    const agrees = c.responses.filter((r) => r.agree).length;
    result.consents[c.role as RoleKey] = {
      tool: c.tool,
      proposedBy: c.proposedBy.name,
      proposedById: c.proposedById,
      agreed: agrees,
      responded: c.responses.length,
      totalMembers: members.length,
      respondBy: formatDeadline(c.respondBy),
      iAgreed: session ? c.responses.some((r) => r.memberId === session.id && r.agree) : false,
    };
  }

  return result;
}

/* ── 인증 · 기기 ────────────────────────────────────────────── */

/** 새 기기에서 재입장하려는 요청. **팀장에게만** 보여 준다. */
export type RejoinRequest = {
  id: string;
  who: string;
  device: string;
  when: string;
  /** 팀을 나갔다 온 사람인지. 돌아오길 바라는 상황이라 승인해야 명단에 돌아온다. */
  leftBefore: boolean;
};

/**
 * 지금 승인을 기다리는 재입장 요청.
 *
 * 팀장이 아니면 빈 목록이다 — 화면에서 감추는 것과 별개로 데이터 자체를 주지 않는다.
 */
export async function getRejoinRequests(teamId: string): Promise<RejoinRequest[]> {
  const session = await getSessionMember();
  if (!session || !session.isLeader) return [];

  const claims = await db.memberClaim.findMany({
    // **나간 사람도 포함한다.** 재입장 경로 자체가 `leftAt` 을 다시 비워 주므로(팀을
    // 나갔다 온 사람을 되돌리는 길) 그런 사람의 요청이 정상적으로 생긴다. 여기서
    // 걸러 내면 팀장 화면엔 "기대하는 요청이 없습니다"만 뜬다 — 그래놓고 요청자는
    // 24시간 동안 "확인하는 중…"에서 영영 못 빠져나온다. 되돌릴 방법을 팀장에게
    // 안 주는 셈이라 더 나쁘다.
    where: { status: "pending", member: { teamId } },
    include: { member: { select: { name: true, leftAt: true } } },
    orderBy: { createdAt: "desc" },
  });

  return claims.map((c) => ({
    id: c.id,
    who: c.member.name,
    device: c.label ?? "알 수 없는 기기",
    when: formatDeadline(c.createdAt),
    leftBefore: c.member.leftAt !== null,
  }));
}

/** 팀에 처음 들어오려는 요청. **팀장에게만** 보여 준다. */
export type JoinRequestRow = {
  id: string;
  name: string;
  /** 고른 1순위 희망 역할 이름. 승인 전에 무엇을 맡으려는지 보인다. */
  want: string;
  device: string;
  when: string;
};

/**
 * 팀장에게 보여 줄 가입 요청 목록.
 *
 * `capped` 는 **새 요청이 막히고 있는지**다. 목록이 비어 있어도 이 값은 따로 돌려준다 —
 * 안 그러면 팀장은 자기 목록이 안 차는 이유를 알 수 없고, 제한을 건 팀원들만 이유를 안다.
 * 제한을 풀 수 있는 사람은 요청을 거절할 수 있는 팀장뿐이라, 알릴 곳도 팀장뿐이다.
 */
export async function getJoinRequests(
  teamId: string,
): Promise<{ rows: JoinRequestRow[]; capped: boolean }> {
  const session = await getSessionMember();
  if (!session || !session.isLeader) return { rows: [], capped: false };

  const rows = await db.joinRequest.findMany({
    where: { teamId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  return {
    capped: isJoinCapped(await countUnresolved(teamId)),
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      want: ROLES.find((role) => role.key === r.wantRole)?.name ?? "미정",
      device: r.label ?? "알 수 없는 기기",
      when: formatDeadline(r.createdAt),
    })),
  };
}

/**
 * 팀장이 관리하는 초대 한 장. **링크는 없다.**
 *
 * 원문 토큰은 발급할 때 한 번만 나오고 서버에는 해시만 남으므로, 이 목록에는 **복사할 링크가
 * 없다.** 비활성화만 할 수 있다. 다시 나눌 거면 새 초대를 만든다 — 어차피 되돌릴 수 있으려면
 * 새로 만드는 편이 나고, 새 것을 만들지 않고 낡은 링크를 계속 복사하는 쪽이 위험하다.
 */
export type InviteRow = {
  id: string;
  label: string;
  /** 이미 승인된 인원 / 허용 인원. `allowed` 가 null 이면 무제한. */
  used: number;
  allowed: number | null;
  /** 만료가 없으면 null. 화면은 "기한 없음" 이라고 말한다. */
  expiresAt: string | null;
  expiresSoon: boolean;
  revoked: boolean;
  createdAt: string;
};

/**
 * 만료가 **3일 이내**인가. 곧 닫힐 것을 알아야 하는 건 목록의 존재 이유다.
 *
 * 판단을 **여기서** 끝내는 편이 낫다. "곧 닫힌다" 를 규칙으로 박아 두지 않으면 화면마다
 * 다른 기준이 생기고, 어느 쪽이 "곧"인지 아무도 모른다.
 */
const INVITE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

/** 팀장에게만. 팀장이 아니면 빈 목록 — 초대 관리는 권한이다(접근도 막는다). */
export async function getTeamInvites(teamId: string): Promise<InviteRow[]> {
  const session = await getSessionMember();
  if (!session || !session.isLeader) return [];

  const now = Date.now();
  const rows = await db.teamInvite.findMany({
    where: { teamId },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    // 이름이 없으면 시각으로 대신한다 — 빈 칸보다 나쁘지 않은 최선.
    label: r.label ?? formatDeadline(r.createdAt),
    used: r.useCount,
    allowed: r.maxUses,
    expiresAt: r.expiresAt ? formatWhen(r.expiresAt) : null,
    expiresSoon:
      r.expiresAt !== null && r.expiresAt.getTime() > now && r.expiresAt.getTime() - now <= INVITE_SOON_MS,
    revoked: r.revokedAt !== null,
    createdAt: formatDeadline(r.createdAt),
  }));
}

/** 내 이름으로 열려 있는 기기 목록. 내 것만 보인다. */
export type MyDevice = {
  /** 토큰의 해시(`deviceIdOf`). 토큰 원문은 화면에 내보내지 않는다. */
  id: string;
  label: string;
  lastSeen: string;
  isCurrent: boolean;
};

export async function getMyDevices(): Promise<MyDevice[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const [sessions, current] = await Promise.all([
    db.session.findMany({
      where: { memberId: session.id },
      orderBy: { lastSeenAt: "desc" },
    }),
    currentSessionToken(),
  ]);

  return sessions.map((s) => ({
    id: deviceIdOf(s.token),
    label: s.label ?? "알 수 없는 기기",
    lastSeen: formatDeadline(s.lastSeenAt),
    isCurrent: s.token === current,
  }));
}

/* ── 08 내 가능한 시간 ─────────────────────────────────────── */

export async function getMyBusyBlocks(_teamId: string): Promise<BusyBlock[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const blocks = await db.busyBlock.findMany({
    where: { memberId: session.id, ...notExpired() },
    orderBy: [{ day: "asc" }, { startHour: "asc" }],
  });

  return blocks.map((b) => ({
    id: b.id,
    day: b.day,
    startHour: b.startHour,
    hours: b.hours,
    kind: b.kind as BusyBlock["kind"],
    label: b.label,
    weekOf: b.weekOf,
  }));
}

/**
 * 지나간 주의 "이 주만" 블록을 뺀다.
 *
 * 지우지 않고 읽을 때 거르는 이유: 지우는 건 저장이 맡는다(내 시간표 저장은 내 블록을 전부
 * 다시 쓴다). 읽기에서 행을 지우면 "읽기만 한다"는 이 모듈의 약속이 깨진다.
 */
function notExpired() {
  return { OR: [{ weekOf: null }, { weekOf: { gte: scheduleWeeks()[0] } }] };
}

/**
 * 팀 겹쳐보기 — 팀원마다 안 되는 시간.
 *
 * 사유는 **여기서 뺀다.** 화면에서 가리면 네트워크 응답에는 남아 개발자 도구로 보인다.
 */
export async function getTeamTimetables(teamId: string): Promise<TeamTimetable[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const [members, asked] = await Promise.all([
    db.member.findMany({
      where: { teamId, ...ACTIVE },
      orderBy: { joinedAt: "asc" },
      select: {
        id: true,
        name: true,
        mbti: true,
        busyBlocks: {
          where: notExpired(),
          select: { day: true, startHour: true, hours: true, weekOf: true },
          orderBy: [{ day: "asc" }, { startHour: "asc" }],
        },
      },
    }),
    askedTodayBy(session.id),
  ]);

  return members.map((m) => ({
    id: m.id,
    name: m.name,
    isMe: m.id === session.id,
    mbti: toMbti(m.mbti),
    // 안 되는 시간을 하나라도 적은 사람 — `getMeetingWeek` 의 "제출" 과 거의 같은 기준이다
    // (저쪽은 지나간 "이 주만" 블록까지 센다. 다음 저장 때 지워진다).
    submitted: m.busyBlocks.length > 0,
    busy: m.busyBlocks,
    askedToday: asked.has(m.id),
  }));
}

/* ── 09 / 10 회의 시간 ─────────────────────────────────────── */

/**
 * 이번 주 회의 시간 후보.
 *
 * 여기서 계산하지 않고 읽기만 한다 — 후보를 만드는 곳은
 * `server/meetings/candidates.ts` 한 곳이고, 시간표나 명단이 바뀔 때 다시 만든다.
 */
export async function getMeetingWeek(teamId: string): Promise<MeetingWeek> {
  const [slots, total, submitted] = await Promise.all([
    db.meetingSlot.findMany({
      where: { teamId, weekKey: "this" },
      orderBy: [{ available: "desc" }, { id: "asc" }],
    }),
    db.member.count({ where: { teamId, ...ACTIVE } }),
    // "시간표를 냈다"는 표시가 따로 없어서 안 되는 시간을 하나라도 적은 사람으로 센다.
    // 한 주가 통째로 비는 사람은 낸 것으로 보이지 않는다 — 확정되지 않은 정책이다.
    //
    // **지난 주의 "이 주만" 블록은 세지 않는다**(`notExpired`). 예전에는 `{ some: {} }` 로
    // 전부 세었는데, 그러면 같은 팀원이 09 화면에서는 "시간표를 냈다"로 세어지면서 10 화면
    //에서는 "시간표 없음"이 되고, 그 사람은 10 의 "아직 안 낸 사람" 목록에 들어간다 — 같은
    // 사실에 두 화면이 다른 말을 하는 셈이다. 10(`getTeamTimetables`)이 이미 이 규칙을 쓰고
    // 있으므로 여기를 맞춘 것이지, 새 규칙을 만든 것이 아니다.
    db.member.count({ where: { teamId, ...ACTIVE, busyBlocks: { some: notExpired() } } }),
  ]);

  return {
    slots: slots.map((s) => ({
      id: s.id,
      day: s.day,
      time: s.time,
      available: s.available,
      total: s.total,
      blockedBy: s.blockedBy,
    })),
    hasFullAvailability: slots.some((s) => s.available === s.total),
    submitted,
    total,
  };
}

/** 지금 올라와 있는 회의 제안. 09/10 화면·홈·일정 탭 배지가 같은 값을 본다. */
export async function getMeetingProposal(teamId: string): Promise<MeetingProposal> {
  const session = await getSessionMember();

  const proposal = await db.meetingProposal.findFirst({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    include: { slot: true, responses: true, note: { select: { id: true } } },
  });

  if (!proposal) {
    return {
      stage: "idle",
      slot: null,
      date: null,
      agreed: 0,
      pending: 0,
      against: 0,
      respondBy: null,
      myResponse: null,
      hasNote: false,
    };
  }

  const total = await db.member.count({ where: { teamId, ...ACTIVE } });
  const agreed = proposal.responses.filter((r) => r.agree).length;
  const against = proposal.responses.filter((r) => !r.agree).length;
  const mine = proposal.responses.find((r) => r.memberId === session?.id);

  return {
    id: proposal.id,
    // 저장된 값이 아니라 **계산한** 상태를 보여 준다 — 예약 작업이 표를 고치기 전에
    // 화면을 열어도 지나간 마감이 "대기 중"으로 보이지 않게.
    stage: effectiveStage({
      stage: proposal.stage as MeetingProposal["stage"],
      respondBy: proposal.respondBy,
      against,
    }),
    slot: proposal.slot
      ? {
          id: proposal.slot.id,
          day: proposal.slot.day,
          time: proposal.slot.time,
          available: proposal.slot.available,
          total: proposal.slot.total,
          blockedBy: proposal.slot.blockedBy,
        }
      : null,
    date: proposal.date,
    agreed,
    against,
    pending: Math.max(0, total - proposal.responses.length),
    respondBy: formatDeadline(proposal.respondBy),
    myResponse: mine ? (mine.agree ? "agree" : "against") : null,
    location: proposal.location ?? null,
    agenda: proposal.agenda ?? null,
    durationMinutes: proposal.durationMinutes ?? 60,
    hasNote: Boolean(proposal.note),
  };
}

/**
 * 팀 통합 캘린더 이벤트 목록.
 *
 * 확정된 회의·제안 중인 회의 + 마감일이 있는 업무(Task) + 마감일이 있는 제출함(DriveBox)을
 * 모아 날짜순·D-Day 순으로 돌려준다.
 */
export async function getTeamCalendarEvents(teamId: string): Promise<CalendarEvent[]> {
  const today = todayInSeoul();
  const currentYear = Number(today.slice(0, 4));

  const [proposals, tasks, boxes] = await Promise.all([
    db.meetingProposal.findMany({
      where: { teamId },
      include: { slot: true, responses: true, note: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.task.findMany({
      where: { teamId, due: { not: "" } },
      include: { assignee: { select: { name: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    db.submissionBox.findMany({
      where: { teamId, dueAt: { not: null } },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  const events: CalendarEvent[] = [];

  // 1. 회의 이벤트 (확정된 회의 or 응답 대기 제안)
  for (const p of proposals) {
    const stage = effectiveStage({
      stage: p.stage as MeetingProposal["stage"],
      respondBy: p.respondBy,
      against: p.responses.filter((r) => !r.agree).length,
    });
    if (stage === "confirmed" || stage === "proposed") {
      const date = p.date ?? (p.slot ? candidateDateOf(p.slot.day)?.date ?? today : today);
      const { dday, ddayText } = calcDday(date, today);
      const isConfirmed = stage === "confirmed";
      events.push({
        id: `meeting-${p.id}`,
        type: "meeting",
        title: isConfirmed ? "정기 팀 회의" : "회의 제안 (응답 대기)",
        date,
        time: p.slot?.time ?? null,
        status: stage,
        dday,
        ddayText,
        location: p.location ?? null,
        agenda: p.agenda ?? null,
        meetingId: p.id,
        hasNote: Boolean(p.note),
        href: "/schedule/slots",
      });
    }
  }

  // 2. 할 일 마감 이벤트 (Task.due)
  for (const t of tasks) {
    const normDate = normalizeTaskDueDate(t.due, currentYear);
    if (!normDate) continue;
    const { dday, ddayText } = calcDday(normDate, today);
    events.push({
      id: `task-${t.id}`,
      type: "task",
      title: t.title,
      date: normDate,
      time: null,
      status: t.status,
      dday,
      ddayText,
      assignee: t.assignee?.name ?? null,
      href: "/home/tasks",
    });
  }

  // 3. 드라이브 제출함 마감 이벤트 (SubmissionBox.dueAt)
  for (const b of boxes) {
    if (!b.dueAt) continue;
    const kstDate = toKstInputValue(b.dueAt); // "YYYY-MM-DDTHH:mm"
    const date = kstDate.slice(0, 10);
    const time = kstDate.slice(11, 16);
    const { dday, ddayText } = calcDday(date, today);
    events.push({
      id: `box-${b.id}`,
      type: "box",
      title: `${b.name} 제출 마감`,
      date,
      time,
      status: "due",
      dday,
      ddayText,
      roleName: b.role,
      href: `/drive/${b.id}`,
    });
  }

  return sortCalendarEvents(events);
}

/* ── 12 / 13 / 22 드라이브 ─────────────────────────────────── */

/** 용량 한도는 아직 확정되지 않은 정책이라 코드에 둔다 — 팀별로 다르게 줄 값이 아니다. */
export async function getDriveLimits(teamId: string): Promise<DriveLimits> {
  const used = await teamUsedBytes(teamId);
  const GB = 1024 * 1024 * 1024;
  return {
    capGB: TEAM_CAP_BYTES / GB,
    usedGB: Math.round((used / GB) * 100) / 100,
    types: ["문서", "이미지", "PPT", "PDF"],
  };
}

/** `SubmissionBox` 한 줄을 만드는 것 — 목록과 하나짜리가 **같은 판정**을 쓴다. */
function toSubmissionBox(
  b: {
    id: string;
    role: string;
    name: string;
    ownerId?: string | null;
    due: string;
    dueAt: Date | null;
    owner: { name: string } | null;
    files: Array<{ versions: Array<{ createdAt: Date; restoredFromId: string | null }> }>;
  },
  session?: { id: string; isLeader: boolean } | null,
): SubmissionBox {
  const canEditDeadline = session
    ? (b.ownerId !== undefined ? b.ownerId === session.id : false) || session.isLeader
    : undefined;

  return {
    id: b.id,
    role: b.role as RoleKey,
    name: b.name,
    owner: b.owner?.name ?? null,
    // 파일이 몇 개인지를 센다 — 예전에는 버전 수를 세어서, 같은 파일을 네 번 고치면 "4개"로 보였다.
    fileCount: b.files.length,
    // 마감 시각이 있으면 그걸로 만든다. 예전 팀은 "미정" 같은 문자열만 있다.
    due: b.dueAt ? formatDue(b.dueAt) : b.due,
    dueAt: b.dueAt ? toKstInputValue(b.dueAt) : null,
    hasLate: b.files.some((f) => f.versions.some((v) => isLateVersion(v, b.dueAt))),
    canEditDeadline,
  };
}

export async function getSubmissionBoxes(teamId: string): Promise<SubmissionBox[]> {
  const session = await getSessionMember();
  const boxes = await db.submissionBox.findMany({
    where: { teamId },
    include: {
      owner: { select: { name: true } },
      files: { include: { versions: { select: { createdAt: true, restoredFromId: true } } } },
    },
    orderBy: { id: "asc" },
  });

  return boxes.map((box) => toSubmissionBox(box, session));
}

/**
 * 홈 브리핑이 **마감 임박**을 판단할 만큼만 읽는다 — 역할과 마감 시각 둘.
 *
 * `getSubmissionBoxes` 를 부르지 않는 이유가 있다: 그 함수는 **모든 제출함의 모든 파일의
 * 모든 버전**을 함께 읽는다(`toSubmissionBox` 의 `fileCount`·`hasLate` 때문). 홈은 그
 * 두 값을 쓰지 않는데 **버전 기록까지 통째로** 당기면 11개가 되던 홈 조회가 무거워진다.
 *
 * **같은 값을 두 판정으로 나누지 않는다.** "마감이 며칠 남았나" 는 여기서 한 번만 계산하고
 *(`briefing.ts` 의 `boxesDueSoon`), 제출함 화면이 `dueAt` 을 읽을 때도 같은 문자열을
 * 쓴다 — 다른 곳에서 `new Date(dueAt)` 를 직접 파싱하면 기준이 어긋난다.
 */
export async function getBoxDeadlines(
  teamId: string,
): Promise<Array<{ role: RoleKey; name: string; dueAt: string | null }>> {
  const boxes = await db.submissionBox.findMany({
    where: { teamId },
    select: { role: true, name: true, dueAt: true },
    orderBy: { id: "asc" },
  });
  return boxes.map((b) => ({ role: b.role as RoleKey, name: b.name, dueAt: b.dueAt ? toKstInputValue(b.dueAt) : null }));
}

/** 제출함 안의 파일 목록. 각 파일의 최신 버전을 함께 준다. */
export async function getSubmittedFiles(
  teamId: string,
  boxId: string,
): Promise<SubmittedFile[]> {
  const files = await db.submittedFile.findMany({
    where: { boxId, box: { teamId } },
    include: {
      box: { select: { dueAt: true } },
      versions: {
        include: { author: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return files.map((f) => {
    const latest = f.versions[0];
    return {
      id: f.id,
      name: f.name,
      kind: f.kind as FileKind,
      versionCount: f.versions.length,
      latestVersionId: latest?.id ?? null,
      latestLabel: latest?.label ?? null,
      latestBy: latest?.author.name ?? null,
      latestWhen: latest ? formatWhen(latest.createdAt) : null,
      size: latest?.size ?? null,
      hasLate: f.versions.some((v) => isLateVersion(v, f.box.dueAt)),
    };
  });
}

/**
 * 제출함 하나(12 화면).
 *
 * **그 제출함만 읽는다.** 예전에는 `getSubmissionBoxes`(팀의 **모든** 제출함 — 각각의 모든 파일과
 * 모든 버전까지) 를 불러와 `.find()` 로 하나를 골랐다. 화면 하나에 세 칸이 있으면 그 세 칸을
 * 다 읽고 하나를 쓰는 셈이었고, 버전은 지워지지 않으므로 시간이 갈수록 그대로 늘었다.
 *
 * 저울추는 `toSubmissionBox` **한 곳**에서 매긴다 — 목록과 여기서 판정이 달라지면 12 화면의
 * "마감을 넘긴 파일" 표시가 목록의 것과 어긋난다(같은 제출함을 두 화면이 다르게 말하는 셈).
 */
export async function getSubmissionBox(
  teamId: string,
  boxId: string,
): Promise<SubmissionBox | null> {
  const session = await getSessionMember();
  const box = await db.submissionBox.findFirst({
    where: { id: boxId, teamId },
    include: {
      owner: { select: { name: true } },
      files: { include: { versions: { select: { createdAt: true, restoredFromId: true } } } },
    },
  });

  return box ? toSubmissionBox(box, session) : null;
}

/** 버전 기록. **맨 앞이 최신**이다. */
export async function getFileVersions(teamId: string, fileId: string): Promise<FileVersion[]> {
  const session = await getSessionMember();
  const versions = await db.fileVersion.findMany({
    where: { fileId, file: { box: { teamId } } },
    include: { author: { select: { name: true } }, file: { select: { box: { select: { dueAt: true } } } } },
    // 같은 초에 올라온 버전이 있으면 정렬이 흔들려 "맨 앞이 최신"이 깨진다.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return versions.map((v) => ({
    id: v.id,
    label: v.label,
    author: v.author.name,
    when: formatWhen(v.createdAt),
    note: v.note,
    size: v.size,
    kind: v.kind as FileVersion["kind"],
    previewUrl: v.previewUrl,
    isLate: isLateVersion(v, v.file.box.dueAt),
    canRestore: session ? v.authorId === session.id || session.isLeader : undefined,
  }));
}

/* ── 19 / 30 / 31 / 32 채팅 ─────────────────────────────────── */

/** DM 스레드 키 — 두 사람의 id 를 정렬해 이어 붙인다(누가 먼저 열든 같은 방). */
export function dmThreadKey(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

/** 한 번에 가져오는 메시지 수. 대화가 쌓여도 방을 열 때마다 받는 양은 이만큼으로 고정된다. */
const MESSAGE_PAGE_SIZE = 40;

export type MessagePage = { messages: ChatMessage[]; nextCursor: string | null };

/** 한 줄을 화면 타입으로. 과거를 부를 때와 새것을 부를 때가 같은 모양이어야 한다. */
type MessageRow = {
  id: string;
  text: string;
  whenLabel: string;
  /** 정렬용 실제 시각. `whenLabel` 은 "21:12" 라 사람이 읽는 문자열이라 비교할 수 없다. */
  createdAt: Date;
  viaCushion: boolean;
  /** **이 사람의 지금 설정으로** 이 말을 어떻게 보여 줄지(읽기 순화). 성공·실패가 모두 담긴다. */
  purifications: CushionRow[];
  attachPath: string | null;
  attachName: string | null;
  attachBytes: number | null;
  attachMime: string | null;
  author: { id: string; name: string; mbti: string | null };
  reactions: { icon: string }[];
  /** 드라이브에서 공유한 버전. 없으면 null — 대다수 말은 이 관계가 없다. */
  driveVersion: {
    id: string;
    label: string;
    size: string;
    kind: string;
    file: { id: string; name: string; boxId: string };
  } | null;
  /** 이 첨부를 드라이브에 올려 만든 버전. */
  savedVersion: { id: string; file: { id: string; boxId: string } } | null;
};

/** `MessagePurification` 한 줄 — 화면이 그릴 상태. */
type CushionRow = {
  status: string;
  text: string | null;
  source: string | null;
  reason: string | null;
  retryAfter: Date | null;
};

/**
 * 순화 상태는 **이 사람이 지금 읽는 지문의 것만** 가져온다.
 *
 * 예전에는 (말, 읽는 사람) 으로 저장했으므로 팀원 수만큼 행이 있었다. 지금은 (말, 지문) 이라
 * 한 말에 한 줄이고, `where` 에는 사람이 아니라 **지문**이 들어간다.
 *
 * 화면에는 **자기 지문의 순화본만** 보여야 한다 — 남의 강도나 남의 말투로 만든 글은 이 사람의
 * 화면에 있으면 안 된다. 지문이 곧 그 경계다.
 */
const messageInclude = (policyHash: string) => ({
  author: { select: { id: true, name: true, mbti: true } },
  reactions: { select: { icon: true } },
  purifications: {
    // **읽는 사람의 지문으로만** 건다 — 지금 쓰는 조건의 결과만 그린다. 옛 설정의 행은
    // 남겨 두었지만 지문이 다르므로 실려 오지 않는다(되돌리면 재사용된다).
    where: { policyHash },
    select: { status: true, text: true, source: true, reason: true, retryAfter: true },
    take: 1,
  },
  // 드라이브 연결은 **말풍선을 그릴 때 필요한 만큼만** 가져온다 — 주소는 화면이 만든다.
  // 여기에 서명 주소를 넣지 않는다: 비공개 버킷이라 주소를 저장하면 만료 뒤에도 남아 있고,
  // 미리보기로 그리는 일은 드라이브 화면이 이미 한다.
  driveVersion: { select: { id: true, label: true, size: true, kind: true, file: { select: { id: true, name: true, boxId: true } } } },
  savedVersion: { select: { id: true, file: { select: { id: true, boxId: true } } } },
}) as const;

/** 드라이브의 그 파일·버전으로 가는 길. 여기에서 두 번 쓰므로 한 곳에 둔다(화면은 값을 받아 쓴다). */
function driveHref(boxId: string, fileId: string, versionId: string): string {
  return `/drive/${boxId}/${fileId}/${versionId}`;
}

/** 저장된 순화 상태를 화면 값으로 옮긴다. 실패는 글 없이 상태만 남는다. */
function toChatPurified(row: CushionRow): ChatPurified {
  if (row.text && (row.status === "PURIFIED" || row.status === "FALLBACK")) {
    return {
      status: row.status,
      text: row.text,
      kind: row.source === "mask" ? "mask" : "ai",
      reason: null,
      retryAfter: null,
    };
  }
  // 실패 상태는 글 없이 상태만 남는다 — 화면이 그 말은 **원문**으로 그린다.
  // 저장되지 않은 status 값(옛 데이터·손으로 넣은 값)은 실패로 본다. 모르는 상태를
  // "순화됨" 으로 그리는 일은 없어야 한다.
  const status: "PENDING" | "REJECTED" | "FAILED" =
    row.status === "PENDING" || row.status === "REJECTED" ? row.status : "FAILED";
  return {
    status,
    text: null,
    kind: null,
    reason: row.reason,
    retryAfter: row.retryAfter ? row.retryAfter.toISOString() : null,
  };
}

function toChatMessage(m: MessageRow, meId: string | null): ChatMessage {
  const counts = new Map<string, number>();
  for (const r of m.reactions) counts.set(r.icon, (counts.get(r.icon) ?? 0) + 1);

  return {
    id: m.id,
    author: m.author.name,
    mbti: toMbti(m.author.mbti),
    isMine: m.author.id === meId,
    text: m.text,
    time: m.whenLabel,
    sortAt: m.createdAt.toISOString(),
    status: "sent",
    viaCushion: m.viaCushion,
    // 순화 상태가 없으면 null — **화면은 그때 원문을 본다.** 실패도 상태로 실려 오고,
    // 실패한 말은 `text: null` 이라 화면에서 원문으로 넘어간다.
    purified: m.purifications[0] ? toChatPurified(m.purifications[0]) : null,
    reactions: counts.size > 0 ? [...counts].map(([icon, count]) => ({ icon, count })) : undefined,
    attachment:
      m.attachPath && m.attachName
        ? {
            name: m.attachName,
            size: humanSize(m.attachBytes ?? 0),
            image: m.attachMime?.startsWith("image/") ?? false,
            savedHref: m.savedVersion
              ? driveHref(m.savedVersion.file.boxId, m.savedVersion.file.id, m.savedVersion.id)
              : null,
          }
        : undefined,
    // 드라이브에서 공유한 말은 **버전 이름 그대로** 보여 준다. 공유한 뒤 그 파일이 새 버전으로
    // 갱신되어도 여기서는 공유할 때의 이름이 남는다 — 무엇을 보냈는지가 바뀌면 안 된다.
    driveFile: m.driveVersion
      ? {
          name: m.driveVersion.file.name,
          label: m.driveVersion.label,
          size: m.driveVersion.size,
          kind: m.driveVersion.kind as FileKind,
          href: driveHref(m.driveVersion.file.boxId, m.driveVersion.file.id, m.driveVersion.id),
        }
      : undefined,
  };
}

/**
 * 최신 쪽부터 `limit` 개(+ 더 있는지 보려고 1개 더).
 *
 * `cursor` 를 주면 그 메시지보다 **오래된** 것부터 이어서 가져온다 — 위로 스크롤해
 * 과거를 불러올 때 쓴다. `createdAt` 만으로는 같은 순간에 여러 메시지가 생기면 순서가
 * 흔들릴 수 있어 `id` 를 함께 정렬 기준으로 둔다.
 */
async function loadMessages(
  teamId: string,
  threadKey: string,
  meId: string | null,
  cursor?: string | null,
  limit: number = MESSAGE_PAGE_SIZE,
): Promise<MessagePage> {
  const { policyHash } = await resolveReadPolicy(meId, threadKey);
  const rows = await db.message.findMany({
    where: { teamId, threadKey },
    include: messageInclude(policyHash),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  const messages = page.map((m) => toChatMessage(m, meId)).reverse();

  return { messages, nextCursor };
}

export async function getTeamMessages(teamId: string): Promise<MessagePage> {
  const session = await getSessionMember();
  return loadMessages(teamId, "team", session?.id ?? null);
}

/**
 * 팀 대화의 마지막 한 줄만.
 *
 * 사이드바 미리보기는 전체 이력이 필요 없다 — `getTeamMessages` 로 40개를 통째로
 * 받아 오는 대신, 색인을 그대로 타는 단건 조회 하나로 끝낸다.
 */
export async function getTeamLastMessage(teamId: string): Promise<ChatMessage | null> {
  const session = await getSessionMember();
  const meId = session?.id ?? null;
  const { policyHash } = await resolveReadPolicy(meId, "team");
  const row = await db.message.findFirst({
    where: { teamId, threadKey: "team" },
    include: messageInclude(policyHash),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? toChatMessage(row, meId) : null;
}

export async function getDmMessages(teamId: string, threadId: string): Promise<MessagePage> {
  const session = await getSessionMember();
  if (!session) return { messages: [], nextCursor: null };
  return loadMessages(teamId, dmThreadKey(session.id, threadId), session.id);
}

/** 위로 스크롤해 불러오는 과거 메시지 한 장. `threadKey` 는 서버 액션이 접근 권한을 확인한 뒤 넘긴다. */
export async function getOlderMessages(
  teamId: string,
  threadKey: string,
  meId: string,
  cursor: string,
): Promise<MessagePage> {
  return loadMessages(teamId, threadKey, meId, cursor);
}

/**
 * `afterId` 보다 **새로 들어온** 메시지. 대화방을 열어 둔 화면이 주기적으로 부른다.
 *
 * 과거를 부르는 쪽(`getOlderMessages`)과 방향만 반대다. 새것이 없으면 빈 배열이라,
 * 대부분의 호출은 아무것도 돌려주지 않고 끝난다 — 그게 정상이고 가장 싼 경우다.
 *
 * `afterId` 가 없으면(아직 한 줄도 없는 방) 오래된 쪽부터 준다. 그 방의 첫 메시지가
 * 곧 "새로 들어온 것"이기 때문이다.
 *
 * 한 번에 주는 양에 상한을 둔다. 오래 닫아 뒀다가 열면 그 사이에 쌓인 말이 많을 수
 * 있는데, 다음 호출이 이어서 가져가므로 한 번에 다 줄 이유가 없다.
 */
export async function getNewerMessages(
  teamId: string,
  threadKey: string,
  meId: string,
  afterId: string | null,
): Promise<ChatMessage[]> {
  const { policyHash } = await resolveReadPolicy(meId, threadKey);
  const rows = await db.message.findMany({
    where: { teamId, threadKey },
    include: messageInclude(policyHash),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MESSAGE_PAGE_SIZE,
    ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
  });

  return rows.map((m) => toChatMessage(m, meId));
}

/**
 * 1:1 대화 목록 — 나를 뺀 팀원 한 명당 하나씩.
 *
 * 팀원 한 명당 "마지막 메시지"·"안 읽은 수"를 따로 쿼리하면 팀원이 늘어난 만큼
 * DB 요청도 늘어난다(실제로 그렇게 늘어나고 있었다). 팀원 수와 무관하게 쿼리 4개로
 * 고정한다: 마지막 메시지는 `distinct`로 스레드당 한 줄만, 안 읽은 수는 스레드마다
 * 다른 기준 시각을 하나의 `groupBy` 안에 OR 조건으로 넣어 한 번에 센다.
 */
/**
 * 이 방의 말을 어떤 말투로 읽는지(19 · 31).
 *
 * **없으면 아직 고르지 않은 것이다.** 화면과 서버가 같은 규칙(`DEFAULT_TONE`)으로 첫
 * 말투를 쓰고, 어느 쪽도 빈 값을 만들어 내지 않는다.
 *
 * 대화방마다 읽는다 — "단톡방은 부드럽게, DM 은 담담하게"가 되어야 하므로.
 */
async function readCushionOf(threadKey: string): Promise<ReadCushionSetting> {
  const session = await getSessionMember();
  if (!session) return READ_CUSHION_DEFAULT;

  const row = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId: session.id, threadKey } },
    select: { enabled: true, mode: true, tone: true },
  });
  // **행이 없으면 팀 전체 기본값**이다. 방마다 따로 고르지 않은 사람은 그 기본을 갖는다 —
  // 한 명만 세게 읽히면 대화의 공기가 갈린다.
  if (!row) return READ_CUSHION_DEFAULT;
  return {
    enabled: row.enabled,
    mode: levelOf({ enabled: row.enabled, mode: row.mode as CushionLevelKey, tone: row.tone }),
    // 모르는 말투는 없는 것으로 본다 — 조용히 다른 말투로 순화하지 않는다.
    tone: isCushionTone(row.tone) ? row.tone : null,
  };
}

export async function getTeamReadCushion(): Promise<ReadCushionSetting> {
  return readCushionOf("team");
}

export async function getDmReadCushion(teamId: string, threadId: string): Promise<ReadCushionSetting> {
  const session = await getSessionMember();
  if (!session) return READ_CUSHION_DEFAULT;
  return readCushionOf(dmThreadKey(session.id, threadId));
}

export async function getConfirmsPolicy(teamId: string) {
  const session = await getSessionMember();
  return confirmsPolicy(teamId, session?.isLeader === true);
}

export type FileViewContext = { box: SubmissionBox; file: SubmittedFile };

export async function getFileViewContext(
  teamId: string,
  boxId: string,
  fileId: string,
): Promise<FileViewContext | null> {
  const session = await getSessionMember();
  const row = await db.submittedFile.findFirst({
    // 어느 팀의 것인지, **그리고 어느 제출함의 것인지** 를 한 번에 확인한다. 예전에는 팀만
    // 확인한 뒤 제출함을 따로 찾아, 팀의 다른 제출함에 있는 파일을 받아올 수도 있었다.
    where: { id: fileId, boxId, box: { teamId } },
    include: {
      box: {
        include: {
          owner: { select: { name: true } },
          _count: { select: { files: true } },
        },
      },
      versions: {
        include: { author: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
    },
  });
  if (!row) return null;

  const late = row.versions.some((v) => isLateVersion(v, row.box.dueAt));
  const canEditDeadline = session
    ? row.box.ownerId === session.id || session.isLeader
    : undefined;
  const box: SubmissionBox = {
    id: row.box.id,
    role: row.box.role as RoleKey,
    name: row.box.name,
    owner: row.box.owner?.name ?? null,
    // 파일이 몇 개인지를 센다 — 예전에는 버전 수를 세어서, 같은 파일을 네 번 고치면 "4개"로 보였다.
    fileCount: row.box._count.files,
    due: row.box.dueAt ? formatDue(row.box.dueAt) : row.box.due,
    dueAt: row.box.dueAt ? toKstInputValue(row.box.dueAt) : null,
    hasLate: late,
    canEditDeadline,
  };

  const latest = row.versions[0];
  const file: SubmittedFile = {
    id: row.id,
    name: row.name,
    kind: row.kind as FileKind,
    versionCount: row.versions.length,
    latestVersionId: latest?.id ?? null,
    latestLabel: latest?.label ?? null,
    latestBy: latest?.author.name ?? null,
    latestWhen: latest ? formatWhen(latest.createdAt) : null,
    size: latest?.size ?? null,
    hasLate: late,
  };

  return { box, file };
}

export async function getDmThreads(teamId: string): Promise<DmThread[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const others = await db.member.findMany({
    where: { teamId, ...ACTIVE, id: { not: session.id } },
    orderBy: { joinedAt: "asc" },
  });
  if (others.length === 0) return [];

  const threadKeyOf = new Map(others.map((other) => [other.id, dmThreadKey(session.id, other.id)]));
  const threadKeys = [...threadKeyOf.values()];

  // 안 읽은 수는 스레드마다 다른 기준 시각(마지막으로 읽은 때)을 써야 해서, 그 시각을
  // 먼저 받아 온 뒤에 물어야 한다.
  const [readMarks, lastMessages] = await Promise.all([
    db.readMark.findMany({ where: { memberId: session.id, threadKey: { in: threadKeys } } }),
    lastMessagePerThread(db, teamId, threadKeys),
  ]);

  const unreadCounts = await db.message.groupBy({
    by: ["threadKey"],
    where: {
      teamId,
      authorId: { not: session.id },
      OR: threadKeys.map((threadKey) => ({
        threadKey,
        createdAt: { gt: readAtByThreadKey(readMarks, threadKey) },
      })),
    },
    _count: { _all: true },
  });

  const lastByThreadKey = new Map(lastMessages.map((m) => [m.threadKey, m]));
  const unreadByThreadKey = new Map(unreadCounts.map((row) => [row.threadKey, row._count._all]));

  return others.map((other) => {
    const threadKey = threadKeyOf.get(other.id)!;
    const last = lastByThreadKey.get(threadKey);

    return {
      id: other.id,
      name: other.name,
      mbti: toMbti(other.mbti),
      lastMessage: last?.text ?? "아직 대화가 없습니다",
      time: last?.whenLabel ?? "",
      unread: unreadByThreadKey.get(threadKey) ?? 0,
    };
  });
}

function readAtByThreadKey(readMarks: { threadKey: string; readAt: Date }[], threadKey: string): Date {
  return readMarks.find((r) => r.threadKey === threadKey)?.readAt ?? new Date(0);
}

export async function getDmThread(teamId: string, threadId: string): Promise<DmThread | null> {
  const threads = await getDmThreads(teamId);
  return threads.find((t) => t.id === threadId) ?? null;
}

/* ── 16 / 17 / 18 / 23 기여도 ───────────────────────────────── */

export async function getMyContrib(_teamId: string): Promise<ContribRecord[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const rows = await db.contribRecord.findMany({
    where: { memberId: session.id },
    // 같은 초에 들어간 행이 있으면 정렬이 흔들려 목록 순서가 조회마다 달라진다.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as ContribRecord["kind"],
    title: r.title,
    detail: r.detail,
    // 사람이 적을 설명이 있으면 그것을, 없으면 실제로 추가한 시각을 보여 준다.
    when: r.whenLabel ?? formatWhen(r.createdAt),
    source: r.source as ContribRecord["source"],
    // **`disputed` 를 `pending` 으로 접지 않는다.** 접으면 팀원이 내 기록에 반박했는데
    // 내 화면에는 "팀원 확인을 거칩니다" 라고만 떠, 반대된 사실이 감춰진다. 본인은
    // 알림 말고 여기서 알아야 한다.
    state: r.state as ContribRecord["state"],
    evidence: toEvidence(r),
  }));
}

/** 근거 파일이 실제로 저장소에 있을 때만 "근거 있음"으로 본다. */
function toEvidence(r: { evidencePath: string | null; evidenceName: string | null; evidenceBytes: number | null }) {
  return r.evidencePath && r.evidenceName
    ? { name: r.evidenceName, size: humanSize(r.evidenceBytes ?? 0) }
    : null;
}

/**
 * 팀 전체의 기록. 내 화면(16)과 **같은 표**를 본다.
 *
 * 계산은 `server/contrib/team-check.ts` 의 `teamCheckRecords` **한 곳**에서 한다 — 첫 로드와
 * 폴링이 같은 값을 보여야 하는데, 예전에는 같은 질의와 매핑이 두 번 적혀 있었다. 팀의 기준
 * (`confirmsNeeded`)이 들어오면서 벌써 한쪽만 고칠 수 있게 됐다(한쪽은 "1/2명 확인", 다른 쪽은
 * "확인됨"처럼 목록마다 다른 말이 붙었다).
 *
 * 여기엔 사본이 하나 더 남아 있었다. 그 사본이 `confirmsNeeded` 를 못 읽고 있어 표시 문구가
 * 다른 목록과 어긋났고, `iCanResolve` 도 돌려주지 않아 화면의 "정정에 응답하기" 가 조건 없이
 * 사라졌다.
 */
export async function getTeamCheck(teamId: string): Promise<TeamCheckRecord[]> {
  const session = await getSessionMember();
  return teamCheckRecords(teamId, session?.id ?? null);
}

export { getContribReport, getPublicReport } from "@/server/contrib/report";

/* ── 21 할 일 ──────────────────────────────────────────────── */

/** `Task.status` 는 DB 에서 `String` 이다 — 모르는 값은 처음 상태로 되돌린다. */
function toTaskStatus(value: string): Task["status"] {
  return value === "doing" || value === "done" ? value : "todo";
}

export async function getTasks(teamId: string): Promise<Task[]> {
  // 담당자가 나인지 알아야 한다 — 내 업무를 나에게 찌를 수는 없고(서버가 막는다),
  // 화면에 그 버튼이 떠 있으면 실패만 눌러 보게 된다.
  const session = await getSessionMember();
  const rows = await db.task.findMany({
    where: { teamId },
    include: { assignee: { select: { id: true, name: true, mbti: true, leftAt: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind as Task["kind"],
    assignee: t.assignee?.name ?? null,
    mbti: toMbti(t.assignee?.mbti),
    // 팀을 나간 담당자도 이름은 남는다 — 기록은 남겨야 하되, 알림은 갈 수 없다.
    assigneeLeft: t.assignee?.leftAt != null,
    isMine: t.assigneeId != null && t.assigneeId === session?.id,
    due: t.due,
    status: toTaskStatus(t.status),
    source: t.source as Task["source"],
    // **판정은 `canEditTask` 한 곳에서만 한다.** 화면이 같은 규칙을 다시 짜면 어느 쪽이
    // 어긋났는지 알 수 없다 — 서버 액션이랑 화면 함수 두 벌을 두면 그렇게 된다.
    canEdit: canEditTask(t, session),
    editBlockedBecause: taskEditBlock(t, session),
  }));
}

/**
 * 24 오늘 내가 이미 콕 찌른 업무의 id.
 *
 * 하루 한 번 제한이라 **오늘 내가 보낸 것만** 본다 — 팀 전체의 찌르기를 보여 주면
 * 익명이 깨지고(누가 언제 몇 번 보냈는지 드러난다), 남이 보냈다고 내 버튼이 잠길 이유도 없다.
 */
export async function getMyPokedTaskIds(teamId: string): Promise<string[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const pokes = await db.poke.findMany({
    where: { senderId: session.id, sentOn: today, task: { teamId } },
    select: { taskId: true },
  });

  return pokes.map((p) => p.taskId);
}

/* ── 알림 ───────────────────────────────────────────────────── */

/** 내게 온 알림. 최근 것이 위. */
/**
 * 내게 온 알림. 최근 것이 위.
 *
 * 안 읽은 수는 목록 창(최근 50건)과 **별개로 전체 기준**이다 — 둘을 따로 세지 않는다
 * (`server/notify/inbox.ts` 가 한 곳에서 함께 돌려준다. 그 주석 참고).
 */
export async function getNotifications(): Promise<{
  items: AppNotification[];
  unread: number;
}> {
  const session = await getSessionMember();
  if (!session) return { items: [], unread: 0 };
  return notificationsFor(session.id);
}

/** 안 읽은 알림 수. 홈의 종 배지에 쓴다. */
export async function getUnreadNotificationCount(): Promise<number> {
  const session = await getSessionMember();
  if (!session) return 0;
  return db.notification.count({ where: { memberId: session.id, readAt: null } });
}

/**
 * 푸시 상태 중 **서버만 알 수 있는 두 가지**.
 *
 * 발신 키가 있는지와 이 사람이 구독을 갖고 있는지는 서버만 안다. 브라우저가 권한을
 * 말해 주면 나머지는 `features/home/push-client.ts` 가 채운다.
 */
export async function getPushState(): Promise<{ configured: boolean; subscribed: boolean }> {
  const session = await getSessionMember();
  const configured = pushConfigured();
  if (!session) return { configured, subscribed: false };
  const held = await db.pushSubscription.count({ where: { memberId: session.id } });
  return { configured, subscribed: held > 0 };
}

/* ── 11 홈 ─────────────────────────────────────────────────── */

export async function getAiTools(): Promise<AiTool[]> {
  return AI_TOOLS;
}

/** 홈의 "최근 자료·업무". 드라이브의 최신 버전과 할 일 화면으로 잇는다. */
export async function getRecentItems(teamId: string): Promise<RecentItem[]> {
  const latest = await db.fileVersion.findFirst({
    where: { file: { box: { teamId } } },
    include: {
      author: { select: { name: true } },
      file: { select: { id: true, name: true, boxId: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  const items: RecentItem[] = [];
  if (latest) {
    items.push({
      id: latest.id,
      title: `${latest.file.name.replace(/\.[^.]+$/, "")} ${latest.label}`,
      note: `${formatWhen(latest.createdAt)} · ${latest.author.name}`,
      icon: "file-check-2",
      href: `/drive/${latest.file.boxId}/${latest.file.id}`,
    });
  }
  // 남은 건수는 화면이 실제 목록에서 센다 — 여기 문구는 비워 둔다.
  items.push({
    id: TASKS_RECENT_ID,
    title: "할 일 · 체크리스트",
    note: "",
    icon: "list-checks",
    href: "/home/tasks",
  });

  return items;
}

/* ── 14 ~ 27 AI 도구 ────────────────────────────────────────── */

/**
 * 여기 있는 것은 **화면을 열자마자 보이는 값**뿐이다 — 예시 입력과, 아직 아무것도
 * 물어보지 않았을 때 자리를 채우는 예시 결과.
 *
 * ⚠️ 이 자리에서 모델을 부르지 않는다. 첫 화면을 AI 로 채우면 페이지를 열 때마다,
 * 빌드할 때마다 호출이 나간다(실제로 그렇게 돼 있었다). 사용자가 직접 요청한 호출만
 * `server/actions/ai.ts` 를 거쳐 나간다 — 거기에 세션 확인이 붙는다.
 *
 * 도구 내용은 `server/ai/tools.ts` 한 곳에 있다. `ANTHROPIC_API_KEY` 가 없으면 거기서도
 * 같은 샘플이 나오고, 화면은 `getAiStatus()` 로 어느 쪽인지 알아 사용자에게 그대로 알린다.
 */

/** AI 가 실제로 붙어 있는지. 화면이 "샘플"이라고 말할지 말지를 이 값으로 정한다. */
export async function getAiStatus(): Promise<{ connected: boolean }> {
  return { connected: isAiConfigured() };
}

export async function getAiPolicy(): Promise<AiPolicy> {
  return AI_POLICY;
}
export async function getCushionTones(): Promise<CushionTone[]> {
  return CUSHION_TONES;
}
export async function getCushionSample(): Promise<string> {
  return CUSHION_SAMPLE_INPUT;
}
export async function getCushionSampleOutput(tone: string): Promise<string> {
  return CUSHION_SAMPLE_OUTPUT[tone] ?? CUSHION_SAMPLE_OUTPUT.soft;
}
export async function getClerkSample(): Promise<string> {
  return CLERK_SAMPLE_INPUT;
}
export async function getResearchSampleQuery(): Promise<string> {
  return RESEARCH_SAMPLE_QUERY;
}
export async function getResearchSampleResults(): Promise<ResearchResult[]> {
  return RESEARCH_SAMPLE_RESULTS;
}
export async function getPresentSample(): Promise<string> {
  return PRESENT_SAMPLE_INPUT;
}
export async function getPresentSampleDraft(): Promise<PresentDraft> {
  return PRESENT_SAMPLE_DRAFT;
}
export async function getSentenceModes(): Promise<SentenceMode[]> {
  return SENTENCE_MODES;
}
export async function getSentenceSample(mode: string): Promise<string> {
  return SENTENCE_SAMPLE_INPUT[mode] ?? "";
}
export async function getSentenceSampleOutput(mode: string): Promise<string> {
  return SENTENCE_SAMPLE_OUTPUT[mode] ?? "";
}

/* ── 회의록 아카이브 ─────────────────────────────────────────── */

export async function getMeetingProposalById(
  teamId: string,
  proposalId: string,
): Promise<{
  id: string;
  date: string | null;
  time: string | null;
  location: string | null;
  agenda: string | null;
  durationMinutes: number;
} | null> {
  const proposal = await db.meetingProposal.findFirst({
    where: { id: proposalId, teamId },
    include: { slot: true },
  });
  if (!proposal) return null;
  return {
    id: proposal.id,
    date: proposal.date,
    time: proposal.slot?.time ?? null,
    location: proposal.location ?? null,
    agenda: proposal.agenda ?? null,
    durationMinutes: proposal.durationMinutes ?? 60,
  };
}

export async function getMeetingNote(noteId: string): Promise<MeetingNote | null> {
  const session = await getSessionMember();
  if (!session) return null;

  const note = await db.meetingNote.findFirst({
    where: { id: noteId, teamId: session.teamId },
    include: { createdBy: { select: { name: true } } },
  });
  if (!note) return null;

  return {
    id: note.id,
    teamId: note.teamId,
    meetingId: note.meetingId,
    title: note.title,
    rawText: note.rawText,
    summary: note.summary,
    taskCount: note.taskCount,
    createdById: note.createdById,
    createdByName: note.createdBy?.name ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

export async function getMeetingNoteByProposal(meetingId: string): Promise<MeetingNote | null> {
  const session = await getSessionMember();
  if (!session) return null;

  const note = await db.meetingNote.findFirst({
    where: { meetingId, teamId: session.teamId },
    include: { createdBy: { select: { name: true } } },
  });
  if (!note) return null;

  return {
    id: note.id,
    teamId: note.teamId,
    meetingId: note.meetingId,
    title: note.title,
    rawText: note.rawText,
    summary: note.summary,
    taskCount: note.taskCount,
    createdById: note.createdById,
    createdByName: note.createdBy?.name ?? null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}




