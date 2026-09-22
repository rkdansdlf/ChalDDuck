import "server-only";

import { ROLES } from "@/data/catalog";
import type { RoleKey } from "@/lib/types";
import { effectiveStage } from "@/features/schedule/meeting-model";
import { isUnresolvedClash } from "@/features/roles/roster-model";
import { dmThreadKey } from "@/data/api";
import { db } from "@/server/db";
import type { SessionMember } from "@/server/session";

/**
 * 내비게이션과 홈의 종에 붙는 숫자들.
 *
 * 화면이 몇십 초마다 이걸 부른다. 그래서 **세기만 한다** — 탭 셸(`(tabs)/layout.tsx`)은
 * 같은 배지를 위해 명단·기록·대화 목록을 통째로 읽는데, 그 값을 주기적으로 다시 받으면
 * 아무도 아무 일도 하지 않는 동안 그 읽기가 계속 나간다. 여기서는 목록을 만들지 않고
 * `count` 만 쓴다.
 *
 * 첫 숫자는 여전히 레이아웃이 서버에서 그려 준다. 이 함수는 **그 뒤를 따라가는 값**이다.
 */
export type NavBadges = {
  /** 팀 탭 — 겹친 역할 + 확인이 필요한 기여 기록 + 승인 대기(팀장만). */
  team: number;
  /** 일정 탭 — 내 응답을 기다리는 회의 제안이 있으면 1. */
  cal: number;
  /** 채팅 탭 — 안 읽은 DM 수. */
  chat: number;
  /** 홈의 종 — 안 읽은 알림 수. */
  notifications: number;
};

export async function readNavBadges(me: SessionMember): Promise<NavBadges> {
  const [clashes, contrib, approvals, cal, chat, notifications] = await Promise.all([
    countRoleClashes(me.teamId),
    countContribPending(me),
    countApprovalsWaiting(me),
    countMeetingWaiting(me),
    countUnreadDms(me),
    db.notification.count({ where: { memberId: me.id, readAt: null } }),
  ]);

  return { team: clashes + contrib + approvals, cal, chat, notifications };
}

/**
 * 희망이 겹쳐 아직 정해지지 않은 역할 수.
 *
 * 명단을 받아 오지 않고 역할별 희망자 수만 센다. 겹쳤는지 판단하는 규칙은
 * `isUnresolvedClash` 한 곳에 있다 — 07 화면과 이 배지가 같은 답을 내야 한다.
 */
async function countRoleClashes(teamId: string): Promise<number> {
  const [wanters, accepted] = await Promise.all([
    db.member.groupBy({
      by: ["wantRole"],
      where: { teamId, leftAt: null, wantRole: { not: null } },
      _count: { _all: true },
    }),
    db.roleDraw.findMany({ where: { teamId, accepted: true }, select: { role: true } }),
  ]);

  const acceptedRoles = new Set(accepted.map((d) => d.role));
  const countOf = new Map(wanters.map((w) => [w.wantRole as RoleKey, w._count._all]));

  return ROLES.filter((role) =>
    isUnresolvedClash(countOf.get(role.key) ?? 0, acceptedRoles.has(role.key)),
  ).length;
}

/**
 * 기여 기록으로 떠 있는 건수 — 내 기록의 확인 대기 + 내가 확인해 줘야 하는 팀원 기록.
 *
 * 둘을 더하는 이유는 배지가 "내가 뭔가 해야 한다"는 뜻이기 때문이다. 팀원 기록은
 * 내가 아직 확인하지 않은 것만 센다 — 이미 눌렀는데 숫자가 남아 있으면 안 된다.
 */
async function countContribPending(me: SessionMember): Promise<number> {
  const [mine, awaitingMe] = await Promise.all([
    db.contribRecord.count({ where: { memberId: me.id, state: "pending" } }),
    db.contribRecord.count({
      where: {
        member: { teamId: me.teamId, leftAt: null },
        memberId: { not: me.id },
        state: "pending",
        confirms: { none: { memberId: me.id } },
      },
    }),
  ]);

  return mine + awaitingMe;
}

/** 팀장이 열어 줘야 하는 문 — 새로 들어오려는 사람과 기기를 바꾼 팀원. 팀장이 아니면 0. */
async function countApprovalsWaiting(me: SessionMember): Promise<number> {
  if (!me.isLeader) return 0;

  const [claims, joins] = await Promise.all([
    db.memberClaim.count({
      where: { status: "pending", member: { teamId: me.teamId, leftAt: null } },
    }),
    db.joinRequest.count({ where: { status: "pending", teamId: me.teamId } }),
  ]);

  return claims + joins;
}

/**
 * 내 응답을 기다리는 회의 제안.
 *
 * 저장된 `stage` 가 아니라 **계산한 상태**를 본다 — 마감이 지나 이미 확정된 제안에
 * "응답하세요" 배지가 남아 있으면 안 된다(예약 작업이 표를 고치는 건 하루 한 번이다).
 */
async function countMeetingWaiting(me: SessionMember): Promise<number> {
  const proposal = await db.meetingProposal.findFirst({
    where: { teamId: me.teamId },
    orderBy: { createdAt: "desc" },
    select: {
      stage: true,
      respondBy: true,
      responses: { select: { agree: true, memberId: true } },
    },
  });
  if (!proposal) return 0;

  const stage = effectiveStage({
    stage: proposal.stage as "proposed" | "confirmed" | "carried",
    respondBy: proposal.respondBy,
    against: proposal.responses.filter((r) => !r.agree).length,
  });

  const answered = proposal.responses.some((r) => r.memberId === me.id);
  return stage === "proposed" && !answered ? 1 : 0;
}

/**
 * 안 읽은 DM 수.
 *
 * 방마다 기준 시각(마지막으로 읽은 때)이 달라서, 먼저 내 읽음 표시를 받아 온 뒤에
 * 한 번의 `count` 로 센다. 아직 한 번도 열지 않은 방은 표시가 없으므로 **전부**
 * 안 읽음이다 — 그 방들은 `notIn` 한 줄로 함께 센다.
 *
 * 팀 단톡방은 세지 않는다. 지금 탭 배지가 DM 만 세고 있어서 그 뜻을 바꾸지 않는다.
 */
async function countUnreadDms(me: SessionMember): Promise<number> {
  const others = await db.member.findMany({
    where: { teamId: me.teamId, leftAt: null, id: { not: me.id } },
    select: { id: true },
  });
  if (others.length === 0) return 0;

  const threadKeys = others.map((other) => dmThreadKey(me.id, other.id));
  const readMarks = await db.readMark.findMany({
    where: { memberId: me.id, threadKey: { in: threadKeys } },
    select: { threadKey: true, readAt: true },
  });

  const marked = readMarks.map((r) => r.threadKey);
  const unseen = threadKeys.filter((key) => !marked.includes(key));

  return db.message.count({
    where: {
      teamId: me.teamId,
      authorId: { not: me.id },
      OR: [
        ...readMarks.map((r) => ({ threadKey: r.threadKey, createdAt: { gt: r.readAt } })),
        ...(unseen.length > 0 ? [{ threadKey: { in: unseen } }] : []),
      ],
    },
  });
}
