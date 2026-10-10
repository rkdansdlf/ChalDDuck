"use server";

import { revalidatePath } from "next/cache";
import type { AppNotification } from "@/lib/types";
import { notificationsFor } from "@/server/notify/inbox";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 알림 읽음 처리.
 *
 * 읽음은 **내 알림에만** 찍을 수 있다 — 조건에 `memberId` 를 함께 넣는 이유다.
 * 알림 id 만 알면 남의 알림을 읽음으로 바꿀 수 있으면 안 된다.
 *
 * **"전부" 는 목록을 아예 주지 않는 것(`undefined`)뿐이다.** 빈 목록은 "읽을 것이 없다" 이다 —
 * 예전에는 빈 목록도 전부로 읽어서, 화면이 거른 결과가 우연히 비었을 때 안 읽은 알림이
 * 통째로 읽음이 됐다.
 */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const me = await requireSessionMember();
  if (ids !== undefined && ids.length === 0) return;

  await db.notification.updateMany({
    where: {
      memberId: me.id,
      readAt: null,
      ...(ids !== undefined ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/home", "layout");
}

/**
 * 알림함을 열지 않고도 다시 읽는다.
 *
 * 알림은 **일어나는 순간에** 보여야 하는데 이 화면은 요청마다만 그렸다. 알림이 도착해도
 * 탭 배지만 바뀌고(30초마다 다시 세므로) 목록은 그대로였으므로, "뭔가 왔는데 목록에 없다"가
 * 가장 흔한 상태였다. 배지가 숫자를 올려 주면서 정작 그 숫자가 가리키는 곳이 낡아 있으면
 * 어느 쪽을 믿어야 할지 모른다.
 *
 * 주기는 알림함에 맞게 길게 둔다 — 확인은 사람이 하는 일이다.
 */
export async function pollNotifications(): Promise<{
  items: AppNotification[];
  unread: number;
}> {
  const me = await requireSessionMember();
  return notificationsFor(me.id);
}
