import "server-only";

import type { Prisma } from "@/generated/prisma";
import { humanSize } from "@/features/drive/file-rules";
import type { ConfirmsPolicy, ContribEvidence, TeamCheckRecord } from "@/lib/types";
import { isMarked, type Participation } from "@/features/contrib/participation";
import { db } from "@/server/db";
import { canResolveContrib, contribByLabel, maxConfirmsNeeded } from "@/server/contrib/state";
import { getSessionMember } from "@/server/session";

/**
 * 17 화면이 보는 목록 — **처음 로드할 때와 폴링할 때가 같은 계산을 쓴다.**
 *
 * 예전에는 `getTeamCheck()` 와 `pollContribCheck()` 가 같은 질의와 같은 매핑을 각각 적고
 * 있었다. 두 곳이 같은 값을 보여 주어야 하는데, 확인 수에 팀의 기준(`confirmsNeeded`)이
 * 들어오면서 벌써 한쪽만 고칠 수 있게 됐다 — 목록마다 "확인됨"이 다르게 보이는 사고로
 * 이어진다. 그래서 질의와 매핑을 여기 한 곳에 둔다.
 */
const CHECK_SELECT = {
  id: true,
  memberId: true,
  disputedById: true,
  state: true,
  title: true,
  dispute: true,
  resolution: true,
  evidencePath: true,
  evidenceName: true,
  evidenceBytes: true,
  member: {
    select: { id: true, name: true, leftAt: true, team: { select: { confirmsNeeded: true } } },
  },
  disputedBy: { select: { id: true, name: true, leftAt: true } },
  confirms: { select: { memberId: true } },
  // 의견의 **전체 이력.** 지금 떠 있는 의견 하나만 보여 주면 앞선 말이 사라진 것처럼
  // 보인다 — 실제로 opinions 가 덮여 있었다. 시간순으로 모두 준다.
  disputes: {
    select: { id: true, text: true, createdAt: true, by: { select: { name: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  // 참여 표시의 **이력까지** 가져온다 — 취소한 표시까지 보여 주려면 지금 표시 중인 것만으로는
  // 부족하다("왜 없지"에 답해야 한다).
  participations: {
    select: {
      id: true,
      activeKey: true,
      shownAt: true,
      clearedAt: true,
      shownBy: { select: { name: true } },
      clearedBy: { select: { name: true } },
    },
    orderBy: [{ shownAt: "desc" }, { id: "desc" }],
  },
} satisfies Prisma.ContribRecordSelect;

export async function teamCheckRecords(teamId: string, meId: string | null): Promise<TeamCheckRecord[]> {
  const rows = await db.contribRecord.findMany({
    where: { member: { teamId } },
    select: CHECK_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((r) => {
    const state = r.state as TeamCheckRecord["state"];
    // 내 기록이면 의견을 적은 사람과, 아니면 기록 주인과 이야기한다.
    const other = r.member.id === meId ? r.disputedBy : r.member;
    // 경로와 이름이 **둘 다** 있어야 "근거 있음"이다 — 이름 없는 파일은 열어도 무슨 파일인지
    // 알 수 없다.
    const evidence: ContribEvidence | null =
      r.evidencePath && r.evidenceName
        ? { name: r.evidenceName, size: humanSize(r.evidenceBytes ?? 0) }
        : null;

    return {
      id: r.id,
      who: r.member.name,
      title: r.title,
      state,
      isMine: r.member.id === meId,
      confirms: r.confirms.length,
      iConfirmed: r.confirms.some((c) => c.memberId === meId),
      // 정정에 응답할 수 있는지는 `contrib/state.ts` 한 곳이 정한다.
      iCanResolve: canResolveContrib({
        memberId: r.memberId,
        disputedById: r.disputedById,
        meId: meId ?? "",
      }),
      // 표시 문구는 저장하지 않고 그때그때 만든다 — 저장해 두면 확인 수와 어긋난다.
      by: contribByLabel({
        state,
        confirms: r.confirms.length,
        needed: r.member.team.confirmsNeeded,
        disputedBy: r.disputedBy?.name ?? null,
      }),
      evidence,
      participation: latestParticipation(r.participations),
      dispute: r.dispute,
      history: r.disputes.map((d) => ({ who: d.by.name, text: d.text })),
      resolution: r.resolution,
      dmWith: other && other.leftAt === null && other.id !== meId ? other.id : null,
    };
  });
}

/**
 * 팀이 정한 확정 기준.
 *
 * `max` 는 팀원 수에서 1을 뺀 만큼이다 — 자기 기록은 자기 자신이 확인하지 못하므로 그보다
 * 큰 기준은 아무도 채울 수 없다. `canChange` 는 화면이 버튼을 감추기 위한 값이고,
 * **권한은 서버가 다시 확인한다**(`requireLeader`).
 */
export async function confirmsPolicy(
  teamId: string,
  isLeader: boolean,
): Promise<ConfirmsPolicy> {
  const [team, members] = await Promise.all([
    db.team.findUniqueOrThrow({
      where: { id: teamId },
      select: { confirmsNeeded: true },
    }),
    db.member.count({ where: { teamId, leftAt: null } }),
  ]);

  return {
    needed: team.confirmsNeeded,
    max: maxConfirmsNeeded(members),
    canChange: isLeader,
  };
}

/**
 * 이 기록의 참여 표시 — **표시 중인 것을 먼저, 없으면 가장 최근에 취소된 것**을 준다.
 *
 * 지금 표시 중인 줄과 취소된 줄을 둘 다 화면에 내보내면 어느 쪽이 유효한지 화면이 알아야
 * 하고, 그 판단이 두 군데로 흩어진다. 여기서 "무엇을 보여 줄지"를 정한다.
 */
function latestParticipation(
  rows: {
    id: string;
    activeKey: string | null;
    shownAt: Date;
    clearedAt: Date | null;
    shownBy: { name: string };
    clearedBy: { name: string } | null;
  }[],
): Participation | null {
  const row = rows.find((r) => isMarked(r)) ?? rows[0] ?? null;
  if (!row) return null;
  return {
    recordId: "",
    activeKey: row.activeKey,
    shownBy: row.shownBy.name,
    shownAt: row.shownAt,
    clearedBy: row.clearedBy?.name ?? null,
    clearedAt: row.clearedAt,
  };
}

/**
 * 지금 이 사람이 팀장인가 — **세션에서 읽는다.**
 *
 * 화면이 넘긴 값을 믿으면 안 되는 값이다(누구나 `true` 라고 보낼 수 있다). 16·17 화면이
 * 팀장 전용 버튼을 감추기 위한 값이고, 권한은 각 액션이 `requireLeader` 로 다시 확인한다.
 */
export async function isTeamLeader(teamId: string): Promise<boolean> {
  const me = await getSessionMember();
  return me?.teamId === teamId && me.isLeader;
}
