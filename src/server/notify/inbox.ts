import "server-only";

import { db } from "@/server/db";
import { formatDeadline } from "@/lib/when";
import type { AppNotification } from "@/lib/types";

/**
 * 한 사람의 알림함.
 *
 * **한 벌만 둔다.** 예전에는 `api.ts` 의 `getNotifications` 과 화면 폴링용 액션이 각자 같은
 * 조회를 적고 있었다 — 모양이 달라지면(읽음 판정, 시각 표기) 화면마다 다른 값이 보인다.
 * 페이지에서 부르든 폴링이 부르든 이 한 곳을 쓴다.
 *
 * 목록 창과 안 읽은 수는 다른 범위다, 그래서 함께 돌려준다. 목록은 최근 50건만 보여 주는
 * 것이 조용한 정책이지만, "안 읽은 알림 N건" 은 **전체** 기준이어야 한다. 예전에는
 * 화면이 목록에서 직접 세었으므로(`list.filter(!read).length`) 63건이 쌓였는데 "50건" 이라고
 * 말하면서, 탭 배지(`getUnreadNotificationCount` , 전체 기준)는 63을 보여겼다 — 같은 화면의
 * 두 숫자가 어긋나고 어느 쪽을 믿어야 할지 알 수 없었다. 한 계산이 한 곳에서 나오게 한다.
 */
export async function notificationsFor(
  memberId: string,
): Promise<{ items: AppNotification[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { memberId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // 오래된 것까지 다 보여 줄 이유는 없다. 최근 것만 본다.
      take: 50,
    }),
    db.notification.count({ where: { memberId, readAt: null } }),
  ]);

  return {
    unread,
    items: rows.map((n) => ({
      id: n.id,
      kind: n.kind as AppNotification["kind"],
      title: n.title,
      body: n.body,
      href: n.href,
      when: formatDeadline(n.createdAt),
      read: n.readAt !== null,
    })),
  };
}
