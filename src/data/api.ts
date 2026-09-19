import "server-only";

import { redirect } from "next/navigation";
import type { MbtiType } from "@/lib/mbti";
import { isMbtiType } from "@/lib/mbti";
import type {
  AiPolicy,
  AiTool,
  BusyBlock,
  BusyKind,
  ChatMessage,
  ContribKind,
  ContribRecord,
  ContribReportRow,
  CushionTone,
  DmThread,
  DriveLimits,
  FileVersion,
  IceGame,
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
  Task,
  TaskKind,
  Team,
  TeamCheckRecord,
} from "@/lib/types";
import { TASKS_RECENT_ID } from "@/lib/types";
import { isAiConfigured } from "@/server/ai/claude";
import { db } from "@/server/db";
import { getSessionMember } from "@/server/session";
import {
  AI_POLICY,
  AI_TOOLS,
  BUSY_KINDS,
  CLERK_SAMPLE_INPUT,
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
    include: { _count: { select: { members: true } } },
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
    include: { _count: { select: { members: true } } },
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

const toMbti = (value: string | null | undefined): MbtiType | null =>
  isMbtiType(value) ? value : null;
const toRole = (value: string | null): RoleKey | null => (value as RoleKey | null) ?? null;

export async function getRoster(teamId: string): Promise<Member[]> {
  const session = await getSessionMember();
  const members = await db.member.findMany({ where: { teamId }, orderBy: { joinedAt: "asc" } });

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
export async function getMenuOptions(_teamId: string): Promise<string[]> {
  return MENU_OPTIONS;
}
export async function getScheduleOptions(): Promise<{
  kinds: BusyKind[];
  days: string[];
  hours: string[];
}> {
  return { kinds: BUSY_KINDS, days: SCHEDULE_DAYS, hours: SCHEDULE_HOURS };
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

/* ── 08 내 가능한 시간 ─────────────────────────────────────── */

export async function getMyBusyBlocks(_teamId: string): Promise<BusyBlock[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const blocks = await db.busyBlock.findMany({
    where: { memberId: session.id },
    orderBy: [{ day: "asc" }, { startHour: "asc" }],
  });

  return blocks.map((b) => ({
    id: b.id,
    day: b.day,
    startHour: b.startHour,
    hours: b.hours,
    kind: b.kind as BusyBlock["kind"],
  }));
}

/* ── 09 / 10 회의 시간 ─────────────────────────────────────── */

/**
 * 이번 주 회의 시간 후보.
 *
 * `preview` 는 **데모 전용**이다 — 전원 불가한 주가 어떻게 보이는지 확인하기 위한 것으로,
 * 후보를 실제 시간표에서 계산하게 되면 없앤다.
 */
export async function getMeetingWeek(teamId: string, preview?: "none"): Promise<MeetingWeek> {
  const [slots, total] = await Promise.all([
    db.meetingSlot.findMany({
      where: { teamId, weekKey: preview === "none" ? "none" : "this" },
      orderBy: { available: "desc" },
    }),
    db.member.count({ where: { teamId } }),
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
    submitted: total,
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

  const total = await db.member.count({ where: { teamId } });
  const agreed = proposal.responses.filter((r) => r.agree).length;
  const against = proposal.responses.filter((r) => !r.agree).length;
  const mine = proposal.responses.find((r) => r.memberId === session?.id);

  return {
    stage: proposal.stage as MeetingProposal["stage"],
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
  const versions = await db.fileVersion.findMany({
    where: { box: { teamId } },
    select: { size: true },
  });

  // "8.4MB" 같은 표시 문자열을 더해 대략의 사용량을 낸다. 실제 바이트 수가 생기면 그걸로 바꾼다.
  const usedMB = versions.reduce((sum, v) => sum + (Number.parseFloat(v.size) || 0), 0);

  return {
    capGB: 2,
    usedGB: Math.round((usedMB / 1024) * 100) / 100,
    types: ["문서", "이미지", "PPT", "PDF"],
  };
}

export async function getSubmissionBoxes(teamId: string): Promise<SubmissionBox[]> {
  const boxes = await db.submissionBox.findMany({
    where: { teamId },
    include: { owner: { select: { name: true } }, versions: { select: { isLate: true } } },
    orderBy: { id: "asc" },
  });

  return boxes.map((b) => ({
    id: b.id,
    role: b.role as RoleKey,
    name: b.name,
    owner: b.owner.name,
    fileName: b.fileName,
    fileCount: b.versions.length,
    due: b.due,
    hasLate: b.versions.some((v) => v.isLate),
  }));
}

export async function getSubmissionBox(
  teamId: string,
  boxId: string,
): Promise<SubmissionBox | null> {
  const boxes = await getSubmissionBoxes(teamId);
  return boxes.find((b) => b.id === boxId) ?? null;
}

/** 버전 기록. **맨 앞이 최신**이다. */
export async function getFileVersions(_teamId: string, boxId: string): Promise<FileVersion[]> {
  const versions = await db.fileVersion.findMany({
    where: { boxId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return versions.map((v) => ({
    id: v.id,
    label: v.label,
    author: v.author.name,
    when: v.whenLabel,
    note: v.note,
    size: v.size,
    kind: v.kind as FileVersion["kind"],
    previewUrl: v.previewUrl,
  }));
}

/* ── 19 / 30 / 31 / 32 채팅 ─────────────────────────────────── */

/** DM 스레드 키 — 두 사람의 id 를 정렬해 이어 붙인다(누가 먼저 열든 같은 방). */
export function dmThreadKey(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

async function loadMessages(teamId: string, threadKey: string, meId: string | null) {
  const rows = await db.message.findMany({
    where: { teamId, threadKey },
    include: {
      author: { select: { id: true, name: true, mbti: true } },
      reactions: { select: { icon: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map<ChatMessage>((m) => {
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
    };
  });
}

export async function getTeamMessages(teamId: string): Promise<ChatMessage[]> {
  const session = await getSessionMember();
  return loadMessages(teamId, "team", session?.id ?? null);
}

export async function getDmMessages(teamId: string, threadId: string): Promise<ChatMessage[]> {
  const session = await getSessionMember();
  if (!session) return [];
  return loadMessages(teamId, dmThreadKey(session.id, threadId), session.id);
}

/** 1:1 대화 목록 — 나를 뺀 팀원 한 명당 하나씩. */
export async function getDmThreads(teamId: string): Promise<DmThread[]> {
  const session = await getSessionMember();
  if (!session) return [];

  const [others, readMarks] = await Promise.all([
    db.member.findMany({ where: { teamId, id: { not: session.id } }, orderBy: { joinedAt: "asc" } }),
    db.readMark.findMany({ where: { memberId: session.id } }),
  ]);
  const readAt = new Map(readMarks.map((r) => [r.threadKey, r.readAt]));

  return Promise.all(
    others.map(async (other) => {
      const threadKey = dmThreadKey(session.id, other.id);
      const [last, unread] = await Promise.all([
        db.message.findFirst({ where: { teamId, threadKey }, orderBy: { createdAt: "desc" } }),
        db.message.count({
          where: {
            teamId,
            threadKey,
            authorId: { not: session.id },
            createdAt: { gt: readAt.get(threadKey) ?? new Date(0) },
          },
        }),
      ]);

      return {
        id: other.id,
        name: other.name,
        mbti: toMbti(other.mbti),
        lastMessage: last?.text ?? "아직 대화가 없습니다",
        time: last?.whenLabel ?? "",
        unread,
      };
    }),
  );
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
  }));
}

/** 팀 전체의 기록. 내 화면(16)과 **같은 표**를 본다. */
export async function getTeamCheck(teamId: string): Promise<TeamCheckRecord[]> {
  const rows = await db.contribRecord.findMany({
    where: { member: { teamId } },
    include: { member: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    who: r.member.name,
    title: r.title,
    state: r.state as TeamCheckRecord["state"],
    by: r.byLabel,
    dispute: r.dispute,
    resolution: r.resolution,
  }));
}

/** 18 리포트의 줄. 확인·미확인·의견 차이를 모두 **같은 표**에서 센다. */
export async function getContribReport(teamId: string): Promise<ContribReportRow[]> {
  const members = await db.member.findMany({
    where: { teamId },
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

/* ── 11 홈 ─────────────────────────────────────────────────── */

export async function getAiTools(): Promise<AiTool[]> {
  return AI_TOOLS;
}

/** 홈의 "최근 자료·업무". 드라이브의 최신 버전과 할 일 화면으로 잇는다. */
export async function getRecentItems(teamId: string): Promise<RecentItem[]> {
  const latest = await db.fileVersion.findFirst({
    where: { box: { teamId } },
    include: { author: { select: { name: true } }, box: { select: { id: true, fileName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const items: RecentItem[] = [];
  if (latest) {
    items.push({
      id: latest.id,
      title: `${latest.box.fileName.replace(/\.[^.]+$/, "")} ${latest.label}`,
      note: `${latest.whenLabel} · ${latest.author.name}`,
      icon: "file-check-2",
      href: `/drive/${latest.box.id}`,
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
