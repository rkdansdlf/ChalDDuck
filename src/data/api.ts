import "server-only";

import { redirect } from "next/navigation";
import type { MbtiType } from "@/lib/mbti";
import { isMbtiType } from "@/lib/mbti";
import { formatDue, formatWhen, toKstInputValue } from "@/lib/when";
import { TEAM_CAP_BYTES, isLateVersion } from "@/features/drive/file-rules";
import { teamUsedBytes } from "@/server/drive/usage";
import type {
  AiPolicy,
  AiTool,
  AppNotification,
  BusyBlock,
  BusyKind,
  ChatMessage,
  ContribKind,
  ContribRecord,
  ContribReportRow,
  CushionTone,
  DmThread,
  DriveLimits,
  FileKind,
  FileVersion,
  IceGame,
  IceView,
  Member,
  MeetingProposal,
  MeetingWeek,
  PresentDraft,
  QuizQuestion,
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
import { scheduleWeeks, weekName, weekRange } from "@/features/schedule/week";
import { isAiConfigured } from "@/server/ai/model";
import { db } from "@/server/db";
import { contribByLabel } from "@/server/contrib/state";
import { iceViewFor } from "@/server/ice/view";
import { askedTodayBy } from "@/server/meetings/schedule-ask";
import { currentSessionToken, getSessionMember } from "@/server/session";
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
  QUIZ,
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
    where: { teamId_name: { teamId: team.id, name: name.trim() } },
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
  return QUIZ;
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
export async function getMenuOptions(_teamId: string): Promise<string[]> {
  return MENU_OPTIONS;
}
export async function getScheduleOptions(): Promise<{
  kinds: BusyKind[];
  /** 직접 입력 사유의 색·대체 이름. 칩에는 본인이 붙인 이름이 보인다. */
  customKind: BusyKind;
  days: string[];
  hours: string[];
  /** 고를 수 있는 주. 첫 주가 기본이고 회의 후보도 그 주로 계산한다. */
  weeks: ScheduleWeek[];
}> {
  return {
    kinds: BUSY_KINDS,
    customKind: CUSTOM_BUSY_KIND,
    days: SCHEDULE_DAYS,
    hours: SCHEDULE_HOURS,
    weeks: scheduleWeeks().map((key) => ({ key, name: weekName(key), range: weekRange(key) })),
  };
}

/* ── 07 역할 조율 ───────────────────────────────────────────── */

/** 팀의 역할 추첨 현황. 07 화면과 탭 배지가 같은 값을 본다. */
export async function getRoleNegotiation(teamId: string): Promise<RoleNegotiation> {
  const [draws, rejections] = await Promise.all([
    db.roleDraw.findMany({
      where: { teamId },
      include: { winner: { select: { name: true } } },
    }),
    db.roleRejection.findMany({
      where: { teamId },
      include: { member: { select: { name: true } } },
    }),
  ]);

  const result: RoleNegotiation = { draws: {}, rejected: {} };

  for (const d of draws) {
    result.draws[d.role as RoleKey] = {
      tool: d.tool,
      winner: d.winner.name,
      accepted: d.accepted,
    };
  }
  for (const r of rejections) {
    const role = r.role as RoleKey;
    result.rejected[role] = [...(result.rejected[role] ?? []), r.member.name];
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
    where: { status: "pending", member: { teamId, ...ACTIVE } },
    include: { member: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return claims.map((c) => ({
    id: c.id,
    who: c.member.name,
    device: c.label ?? "알 수 없는 기기",
    when: formatDeadline(c.createdAt),
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

export async function getJoinRequests(teamId: string): Promise<JoinRequestRow[]> {
  const session = await getSessionMember();
  if (!session || !session.isLeader) return [];

  const rows = await db.joinRequest.findMany({
    where: { teamId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    want: ROLES.find((role) => role.key === r.wantRole)?.name ?? "미정",
    device: r.label ?? "알 수 없는 기기",
    when: formatDeadline(r.createdAt),
  }));
}

/** 내 이름으로 열려 있는 기기 목록. 내 것만 보인다. */
export type MyDevice = {
  token: string;
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
    token: s.token,
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
    db.member.count({ where: { teamId, ...ACTIVE, busyBlocks: { some: {} } } }),
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

/** 화면에 보일 마감 시각. 서버가 포맷해야 사람마다 다르게 보이지 않는다. */
function formatDeadline(at: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(at);
}

/** 지금 올라와 있는 회의 제안. 09/10 화면·홈·일정 탭 배지가 같은 값을 본다. */
export async function getMeetingProposal(teamId: string): Promise<MeetingProposal> {
  const session = await getSessionMember();

  const proposal = await db.meetingProposal.findFirst({
    where: { teamId },
    orderBy: { createdAt: "desc" },
    include: { slot: true, responses: true },
  });

  if (!proposal) {
    return {
      stage: "idle",
      slot: null,
      agreed: 0,
      pending: 0,
      against: 0,
      respondBy: null,
      myResponse: null,
    };
  }

  const total = await db.member.count({ where: { teamId, ...ACTIVE } });
  const agreed = proposal.responses.filter((r) => r.agree).length;
  const against = proposal.responses.filter((r) => !r.agree).length;
  const mine = proposal.responses.find((r) => r.memberId === session?.id);

  return {
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
    agreed,
    against,
    pending: Math.max(0, total - proposal.responses.length),
    respondBy: formatDeadline(proposal.respondBy),
    myResponse: mine ? (mine.agree ? "agree" : "against") : null,
  };
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

export async function getSubmissionBoxes(teamId: string): Promise<SubmissionBox[]> {
  const boxes = await db.submissionBox.findMany({
    where: { teamId },
    include: {
      owner: { select: { name: true } },
      files: { include: { versions: { select: { createdAt: true, restoredFromId: true } } } },
    },
    orderBy: { id: "asc" },
  });

  return boxes.map((b) => ({
    id: b.id,
    role: b.role as RoleKey,
    name: b.name,
    owner: b.owner?.name ?? null,
    // 파일이 몇 개인지를 센다 — 예전에는 버전 수를 세서, 같은 파일을 네 번 고치면
    // "4개"로 보였다.
    fileCount: b.files.length,
    // 마감 시각이 있으면 그걸로 만든다. 예전 팀은 "미정" 같은 문자열만 있다.
    due: b.dueAt ? formatDue(b.dueAt) : b.due,
    dueAt: b.dueAt ? toKstInputValue(b.dueAt) : null,
    hasLate: b.files.some((f) => f.versions.some((v) => isLateVersion(v, b.dueAt))),
  }));
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

export async function getSubmittedFile(
  teamId: string,
  fileId: string,
): Promise<SubmittedFile | null> {
  const file = await db.submittedFile.findFirst({
    where: { id: fileId, box: { teamId } },
    select: { boxId: true },
  });
  if (!file) return null;

  const files = await getSubmittedFiles(teamId, file.boxId);
  return files.find((f) => f.id === fileId) ?? null;
}

export async function getSubmissionBox(
  teamId: string,
  boxId: string,
): Promise<SubmissionBox | null> {
  const boxes = await getSubmissionBoxes(teamId);
  return boxes.find((b) => b.id === boxId) ?? null;
}

/** 버전 기록. **맨 앞이 최신**이다. */
export async function getFileVersions(teamId: string, fileId: string): Promise<FileVersion[]> {
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
  viaCushion: boolean;
  attachPath: string | null;
  attachName: string | null;
  attachBytes: number | null;
  attachMime: string | null;
  author: { id: string; name: string; mbti: string | null };
  reactions: { icon: string }[];
};

const MESSAGE_INCLUDE = {
  author: { select: { id: true, name: true, mbti: true } },
  reactions: { select: { icon: true } },
} as const;

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
    status: "sent",
    viaCushion: m.viaCushion,
    reactions: counts.size > 0 ? [...counts].map(([icon, count]) => ({ icon, count })) : undefined,
    attachment:
      m.attachPath && m.attachName
        ? { name: m.attachName, size: humanSize(m.attachBytes ?? 0), image: m.attachMime?.startsWith("image/") ?? false }
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
  const rows = await db.message.findMany({
    where: { teamId, threadKey },
    include: MESSAGE_INCLUDE,
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
  const row = await db.message.findFirst({
    where: { teamId, threadKey: "team" },
    include: MESSAGE_INCLUDE,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return row ? toChatMessage(row, session?.id ?? null) : null;
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
  const rows = await db.message.findMany({
    where: { teamId, threadKey },
    include: MESSAGE_INCLUDE,
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
    db.message.findMany({
      where: { teamId, threadKey: { in: threadKeys } },
      orderBy: [{ threadKey: "asc" }, { createdAt: "desc" }],
      distinct: ["threadKey"],
    }),
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
    when: r.whenLabel,
    source: r.source as ContribRecord["source"],
    state: r.state === "ok" ? "ok" : "pending",
    evidence: toEvidence(r),
  }));
}

/** 근거 파일이 실제로 저장소에 있을 때만 "근거 있음"으로 본다. */
function toEvidence(r: { evidencePath: string | null; evidenceName: string | null; evidenceBytes: number | null }) {
  return r.evidencePath && r.evidenceName
    ? { name: r.evidenceName, size: humanSize(r.evidenceBytes ?? 0) }
    : null;
}

/** 팀 전체의 기록. 내 화면(16)과 **같은 표**를 본다. */
export async function getTeamCheck(teamId: string): Promise<TeamCheckRecord[]> {
  const session = await getSessionMember();

  const rows = await db.contribRecord.findMany({
    where: { member: { teamId } },
    include: {
      member: { select: { id: true, name: true, leftAt: true } },
      disputedBy: { select: { id: true, name: true, leftAt: true } },
      confirms: { select: { memberId: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((r) => {
    const state = r.state as TeamCheckRecord["state"];
    // 내 기록이면 의견을 적은 사람과, 아니면 기록 주인과 이야기한다.
    const other = r.member.id === session?.id ? r.disputedBy : r.member;
    return {
      id: r.id,
      who: r.member.name,
      title: r.title,
      state,
      isMine: r.member.id === session?.id,
      confirms: r.confirms.length,
      iConfirmed: r.confirms.some((c) => c.memberId === session?.id),
      // 표시 문구는 저장하지 않고 그때그때 만든다 — 저장해 두면 확인 수와 어긋난다.
      by: contribByLabel({
        state,
        confirms: r.confirms.length,
        disputedBy: r.disputedBy?.name ?? null,
      }),
      evidence: toEvidence(r),
      dispute: r.dispute,
      resolution: r.resolution,
      dmWith: other && other.leftAt === null && other.id !== session?.id ? other.id : null,
    };
  });
}

/** 18 리포트의 줄. 확인·미확인·의견 차이를 모두 **같은 표**에서 센다. */
export async function getContribReport(teamId: string): Promise<ContribReportRow[]> {
  const members = await db.member.findMany({
    where: { teamId, ...ACTIVE },
    include: { contribRecords: { select: { state: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return members.map((m) => ({
    memberId: m.id,
    who: m.name,
    role: ROLES.find((r) => r.key === m.wantRole)?.name ?? "미정",
    confirmed: m.contribRecords.filter((r) => r.state === "ok").length,
    pending: m.contribRecords.filter((r) => r.state === "pending").length,
    disputed: m.contribRecords.filter((r) => r.state === "disputed").length,
  }));
}

/* ── 21 할 일 ──────────────────────────────────────────────── */

export async function getTasks(teamId: string): Promise<Task[]> {
  const rows = await db.task.findMany({
    where: { teamId },
    include: { assignee: { select: { name: true, mbti: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    kind: t.kind as Task["kind"],
    assignee: t.assignee?.name ?? null,
    mbti: toMbti(t.assignee?.mbti),
    due: t.due,
    status: t.status as Task["status"],
    source: t.source as Task["source"],
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
export async function getNotifications(): Promise<AppNotification[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const rows = await db.notification.findMany({
    where: { memberId: session.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    // 오래된 것까지 다 보여 줄 이유는 없다. 최근 것만 본다.
    take: 50,
  });

  return rows.map((n) => ({
    id: n.id,
    kind: n.kind as AppNotification["kind"],
    title: n.title,
    body: n.body,
    href: n.href,
    when: formatDeadline(n.createdAt),
    read: n.readAt !== null,
  }));
}

/** 안 읽은 알림 수. 홈의 종 배지에 쓴다. */
export async function getUnreadNotificationCount(): Promise<number> {
  const session = await getSessionMember();
  if (!session) return 0;
  return db.notification.count({ where: { memberId: session.id, readAt: null } });
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
