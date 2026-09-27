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
 */
export async function notificationsFor(memberId: string): Promise<AppNotification[]> {
  const rows = await db.notification.findMany({
    where: { memberId },
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
