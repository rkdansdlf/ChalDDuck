"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 알림 읽음 처리.
 *
 * 읽음은 **내 알림에만** 찍을 수 있다 — 조건에 `memberId` 를 함께 넣는 이유다.
 * 알림 id 만 알면 남의 알림을 읽음으로 바꿀 수 있으면 안 된다.
 */
export async function markNotificationsRead(ids?: string[]): Promise<void> {
  const me = await requireSessionMember();

  await db.notification.updateMany({
    where: {
      memberId: me.id,
      readAt: null,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });

  revalidatePath("/home", "layout");
}
