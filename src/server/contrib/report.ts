import "server-only";

import { db } from "@/server/db";
import { RESOLUTION_WAYS } from "@/features/contrib/resolution";
import { ROLES } from "@/data/catalog";
import { contribTotals } from "@/data/contrib-report-totals";
import { acceptedRoleAssignments } from "@/data/accepted-roles";
import type { ContribReportRow, PublicReportData } from "@/lib/types";

/** 18 리포트의 줄. 확인·미확인·의견 차이를 모두 같은 표에서 센다. */
export async function getContribReport(teamId: string): Promise<ContribReportRow[]> {
  const [members, stateCounts, shownPerRecord, unresolvedRows, acceptedRoles, okRecords] = await Promise.all([
    db.member.findMany({
      where: { teamId },
      select: { id: true, name: true, leftAt: true },
      orderBy: { joinedAt: "asc" },
    }),
    db.contribRecord.groupBy({
      by: ["memberId", "state"],
      where: { member: { teamId } },
      _count: { _all: true },
    }),
    db.contribRecord.findMany({
      where: { member: { teamId } },
      select: {
        memberId: true,
        _count: { select: { participations: { where: { activeKey: { not: null } } } } },
      },
    }),
    db.contribRecord.groupBy({
      by: ["memberId"],
      where: { member: { teamId }, dispute: { not: null }, resolution: RESOLUTION_WAYS.noAgreement },
      _count: { _all: true },
    }),
    acceptedRoleAssignments(db, teamId, ROLES.map((r) => r.key as string)),
    db.contribRecord.findMany({
      where: { member: { teamId }, state: "ok" },
      select: { memberId: true, title: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const totals = contribTotals({
    states: stateCounts.map((r) => ({ memberId: r.memberId, state: r.state, n: r._count._all })),
    shownPerRecord: shownPerRecord.map((r) => ({ memberId: r.memberId, n: r._count.participations })),
    unresolved: unresolvedRows.map((r) => ({ memberId: r.memberId, n: r._count._all })),
  });

  const highlightsByMember = new Map<string, string[]>();
  for (const r of okRecords) {
    const list = highlightsByMember.get(r.memberId) ?? [];
    if (list.length < 3) {
      list.push(r.title);
      highlightsByMember.set(r.memberId, list);
    }
  }

  return members.map((m) => {
    const bucket = totals.get(m.id);
    const roles = acceptedRoles.get(m.id) ?? [];
    return {
      memberId: m.id,
      who: m.name,
      left: m.leftAt !== null,
      role: roles.length > 0 ? roles.map((r) => ROLES.find((x) => x.key === r)?.name).join(" · ") : "미정",
      confirmed: bucket?.confirmed ?? 0,
      pending: bucket?.pending ?? 0,
      disputed: bucket?.disputed ?? 0,
      participations: bucket?.participations ?? 0,
      unresolved: bucket?.unresolved ?? 0,
      highlights: highlightsByMember.get(m.id) ?? [],
    };
  });
}

/**
 * 로그인 없는 외부 열람자(교수님 등)를 위한 리포트 조회.
 * 유효한 토큰일 때만 성적 증빙 데이터를 반환한다.
 */
export async function getPublicReport(token: string): Promise<PublicReportData | null> {
  const record = await db.reportShareToken.findFirst({
    where: {
      token,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      team: { select: { id: true, name: true, course: true } },
    },
  });

  if (!record) return null;

  const rows = await getContribReport(record.teamId);
  const totalConfirmed = rows.reduce((acc, r) => acc + r.confirmed, 0);
  const totalPending = rows.reduce((acc, r) => acc + r.pending, 0);
  const totalDisputed = rows.reduce((acc, r) => acc + r.disputed, 0);
  const totalAll = totalConfirmed + totalPending + totalDisputed;
  const consensusRate = totalAll > 0 ? Math.round((totalConfirmed / totalAll) * 100) : 100;

  const issuedOn = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  })
    .format(record.createdAt)
    .replace(/\.$/, "");

  return {
    teamName: record.team.name,
    course: record.team.course,
    issuedOn,
    scope: (record.scope as "professor" | "internal") ?? "professor",
    memberCount: rows.length,
    totalConfirmed,
    totalPending,
    totalDisputed,
    consensusRate,
    rows,
  };
}
