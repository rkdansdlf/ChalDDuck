import "server-only";

import { db } from "@/server/db";
import type { AnyRoleBucket } from "@/data/role-work";

/**
 * 팀의 기여 기록을 **(사람, 역할, 상태)** 로 센 묶음 — 07 의 수행 기록 요약 재료.
 *
 * 역할이 없는 기록(`roleKey: null`)도 **함께** 센다 — 07 은 "연결된 기록이 없다" 와 "기록이 아예 없다" 를
 * 구분해야 하기 때문이다. 18 리포트의 질의(`getContribReport`)는 역할에 묶인 기록만 센다(그쪽은 합계를 따로
 * 센다). 두 곳 모두 `data/role-work.ts` 의 같은 규칙으로 셈하므로 역할별 수치는 어긋나지 않는다.
 *
 * `groupBy` 라 기록을 통째로 읽지 않고, 기록 한 건은 한 묶음에만 들어간다(중복해서 세지 않는다).
 */
export async function readWorkBuckets(teamId: string): Promise<Map<string, AnyRoleBucket[]>> {
  const rows = await db.contribRecord.groupBy({
    by: ["memberId", "roleKey", "state"],
    where: { member: { teamId } },
    _count: { _all: true },
  });

  const byMember = new Map<string, AnyRoleBucket[]>();
  for (const r of rows) {
    const list = byMember.get(r.memberId) ?? [];
    list.push({ roleKey: r.roleKey, state: r.state, n: r._count._all });
    byMember.set(r.memberId, list);
  }
  return byMember;
}
