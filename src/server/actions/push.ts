"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";
import { pushSubscriptionFrom } from "@/features/home/push-model";
import { pushConfigured } from "@/server/notify/push";

/**
 * 이 브라우저의 푸시 구독을 저장·지운다.
 *
 * **`endpoint` 로 신원을 정하지 않는다.** 브라우저는 화면마다 다른 주소를 만들기도 하고,
 * 같은 사람이 새 기기에서 다시 켜기도 하므로, "누가 보냈는가"는 이 기기의 로그인(세션)으로
 * 정한다. 주소를 안다고 남의 알림을 훔쳐 볼 수는 없다 — 그 주소는 브라우저 안에만 있고
 * 발신 암호화 키(`p256dh`)와 짝을 이뤄야 해서 주소만으로는 아무것도 못 읽는다.
 *
 * 같은 단말이 다시 켜면 행을 쌓지 않고 그 주인을 바꾼다 — 한 사람이 기기를 넘겨 쓰면 그
 * 뒤로 알림은 새 사람에게 가야 하기 때문이다.
 */

export type PushSaveResult = "saved" | "invalid" | "not-configured";

export async function savePushSubscription(json: unknown): Promise<PushSaveResult> {
  const me = await requireSessionMember();

  // 키가 없으면 아무리 저장해도 나가는 곳이 없다 — 거짓말로 저장 성공을 말하지 않는다.
  if (!pushConfigured()) return "not-configured";

  const sub = pushSubscriptionFrom(json);
  if (!sub) return "invalid";

  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { memberId: me.id, ...sub },
    update: { memberId: me.id, p256dh: sub.p256dh, auth: sub.auth },
  });

  revalidatePath("/home/notifications");
  return "saved";
}

/**
 * 이 브라우저에서 푸시를 끈다.
 *
 * 고장 난 구독은 발신할 때(404·410) 지워지지만, **내가 끈 것**은 그때까지 남아 있었다 —
 * 화면에서 "꺼짐"이라고 말하는데 발신은 계속 나간다. 여기서 지운다.
 */
export async function clearPushSubscriptions(): Promise<"cleared"> {
  const me = await requireSessionMember();

  await db.pushSubscription.deleteMany({ where: { memberId: me.id } });

  revalidatePath("/home/notifications");
  return "cleared";
}
