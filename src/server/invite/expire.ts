import "server-only";

import { db } from "@/server/db";
import { leaderIds, notify } from "@/server/notify/create";

/**
 * 팀장이 오래 응답하지 않는 재입장 요청을 **만료**시킨다 — 2026-10-03 결정.
 *
 * ## 왜 만료가 필요한가
 *
 * 재입장 요청은 `pending` 인 채로 **영영 있었다.** 팀장이 보지 않으면 요청자는 폴링을
 * 계속하면서 "확인하는 중…"에서 빠져나오지 못한다. 코드 경로가 있어도 그 화면을 모르는
 * 사람에게는 **영영 못 나가는 길**이었다.
 *
 * `src/features/onboarding/rejoin-screen.tsx` 의 `<Undecided>` 가 말하던 그 미결이다.
 *
 * ## 며칠인가 — 3일
 *
 * 재입장은 **기존 팀원이 새 기기에서 돌아오는 것**이다. 하루는 너무 짧아 승인받기 전에
 * 만료될 수 있고(출장 중 팀장), 일주일은 "무한 대기"에 가까웠다. 3일은 두 사람이 마주 볼
 * 기회가 있는 거리다.
 *
 * ## 만료는 **지우지 않는다**
 *
 * 거절과 승인이 남는 것이 감사 근거다 — `JoinRequest` 도 같은 이유로 요청을 지우지 않는다.
 * 그래서 `expired` 라는 **상태를 새로 두고** 남긴다.
 *
 * ## 재신청은 막지 않는다
 *
 * `MemberClaim` 에 `(memberId, status)` 유일 제약이 없다. 그래서 만료가 재신청을 막지
 * 않는다 — 요청자는 그대로 다시 눌러 **새 토큰**으로 새 요청을 만든다. 이것이 이 기능이
 * 사람이 갇히지 않게 하는 핵심이고, 유니크 제약을 하나 세우는 순간 사라진다.
 *
 * ## 팀장에게 알린다
 *
 * 승인받지 못한 것이 팀장의 쪽 사정이기도 하다. 다음에 같은 사람이 다시 오면 **아는 것이
 * 바로 알린다** — "또 안 봤구나" 가 아니라 "3일 지나 끝났다" 를 말한다.
 * 같은 사람의 오래된 알림은 먼저 지운다(알림이 쌓이지 않게), 그래도 **요청 자체는 남는다.**
 */
import {
  REJOIN_EXPIRED,
  REJOIN_EXPIRED_AFTER_DAYS,
  rejoinExpiredText,
} from "@/lib/rejoin-expire";

export { REJOIN_EXPIRED, REJOIN_EXPIRED_AFTER_DAYS, rejoinExpiredText };

export type RejoinExpiry = {
  /** 만료시킨 요청 수. */
  expired: number;
};

/**
 * 하루 한 번 부르는 예약 작업.
 *
 * **`vercel.json` 의 cron 이 이걸 부른다.** 마감과 같은 성질이다 — 시각이 지나면 저절로 오는
 * 일이므로 아무도 앱을 열지 않아도 지나간다. 그래서 하루 한 번이면 충분하고, 더 잦아도
 * 사용자에게 보이는 차이는 없다.
 */
export async function sweepExpiredRejoins(now: Date = new Date()): Promise<RejoinExpiry> {
  const cutoff = new Date(now.getTime() - REJOIN_EXPIRED_AFTER_DAYS * 24 * 60 * 60 * 1000);

  // **아직 `pending` 인 것만** 본다. 승인·거절된 줄에 손대면 그 결과를 지운다.
  const stale = await db.memberClaim.findMany({
    where: { status: "pending", createdAt: { lt: cutoff } },
    select: {
      id: true,
      token: true,
      memberId: true,
      member: { select: { teamId: true, name: true, leftAt: true } },
    },
  });
  if (stale.length === 0) return { expired: 0 };

  // **조건부 갱신** — 팀장이 그사이 승인·거절했으면 지워서 안 된다. 두 사람이 동시에
  // approving 하는 상황은 실제로 일어난다(폴링과 화면 조회가 겹친다).
  const expired: string[] = [];
  for (const claim of stale) {
    const done = await db.memberClaim.updateMany({
      where: { id: claim.id, status: "pending" },
      data: { status: REJOIN_EXPIRED, resolvedAt: now },
    });
    if (done.count > 0) expired.push(claim.id);
  }
  if (expired.length === 0) return { expired: 0 };

  /** 팀별로 모은다 — 팀장 알림은 팀 단위로 한 번씩. */
  const byTeam = new Map<string, typeof stale>();
  for (const claim of stale) {
    if (!expired.includes(claim.id)) continue;
    const list = byTeam.get(claim.member.teamId) ?? [];
    list.push(claim);
    byTeam.set(claim.member.teamId, list);
  }

  for (const [teamId, claims] of byTeam) {
    // **같은 사람의 오래된 재입장 알림을 먼저 지운다** — 알림이 쌓이지 않게. 알림만 지우는
    // 것이고 **요청은 그대로 남는다**(지워지면 그 사람은 다시 요청할 수 없다).
    await db.notification.deleteMany({
      where: { memberId: { in: await leaderIds(teamId) }, kind: "rejoin-request", readAt: null },
    });
    await notify({
      to: await leaderIds(teamId),
      kind: "rejoin-request",
      title: `${REJOIN_EXPIRED_AFTER_DAYS}일 지나 재입장 요청이 끝났습니다`,
      body: claims.length === 1 ? `${claims[0]!.member.name}님 요청` : `${claims.length}건`,
      href: "/team/access",
    });
  }

  return { expired: expired.length };
}


