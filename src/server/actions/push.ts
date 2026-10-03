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
 *
 * ## 저장도 **한 기기 = 한 줄**이다
 *
 * 예전에는 저장할 때 "이 사람 것 중 이 주소" 로 줄였다(유일 인덱스가 `endpoint` 하나뿐이었다).
 * 그래서 **내 구독 몇 개**인지 알 수 없고, 남에게 넘긴 기기를 되찾는 길도 없었다.
 * 지금은 그대로 두되, **사용자에게 말할 수 있는 값은 기기 수로만** 나게 한다
 * (`countSubscriptions`) — "이 기기가 켜졌는지"와 "내 계정 전체가 켜졌는지"는 다른 값이고,
 * 예전에는 이 둘을 같은 말로 해서 휴대폰에만 켜진 PC가 "켜짐"이라고 말했다.
 */

export type PushSaveResult = "saved" | "invalid" | "not-configured";

/**
 * 이 사람이 **몇 개의 기기**에서 푸시를 받고 있는가.
 *
 * **"이 기기가 켜졌는지"의 답이 아니다.** 그건 브라우저의 `getSubscription()` 이 말해야 하고,
 * 서버가 세는 것은 계정 전체다. 예전에는 이 값을 `subscribed` 라고 이름 붙여 그대로
 * "켜짐" 판정에 섞었다 — 그래서 휴대폰에만 켜진 PC 가 "켜짐"이라고 보였다.
 *
 * 쓰는 곳은 하나다 — **"다른 기기에서도 받고 있어요" 라는 안내를 그럴 때.** 이 기기를 끄고
 * 화면이 "껐습니다"로 바뀌는데 폰으로 계속 받는 상황을, 사용자가 오해하지 않게 알리는 문구다.
 */
export async function countSubscriptions(): Promise<number> {
  const me = await requireSessionMember();
  return db.pushSubscription.count({ where: { memberId: me.id } });
}

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
 *
 * ## 왜 **`endpoint` 하나**만 지우는가 — 두 기기가 섞이지 않게
 *
 * 예전에는 `deleteMany({ where: { memberId: me.id } })` 였다. 그건 **내 모든 기기**를 지운다 —
 * 노트북에서 끄면 **휴대폰 구독까지 사라져** 그 뒤로 알림이 오지 않는다. 화면은 "껐습니다"라고
 * 말하는데 정작 가장 오래 남아 있던 기기가 꺼졌다.
 *
 * 꺼는 쪽이 **자기 주소만** 보내게 한다. 서버는 그 주소와 `memberId` 를 **둘 다** 조건에 넣는다
 * — 주소를 안다고 남의 구독을 지울 수는 없어야 하고, 실제로 자기 것이어야만 지워진다.
 * 조건에 `memberId` 를 함께 두는 것은 방어다: 주소를 추측해 남의 행을 지울 수 없어야 한다.
 *
 * **지운 개수를 세어 돌려준다.** 아무것도 없었으면 그건 "이미 정리되어 있었다" 이고,
 * 그래도 "껐습니다"는 말해도 된다 — 화면에 보이는 결과는 같으니까. 다만 확인해 두는 이유는
 * 브라우저와 서버가 어긋난 경우를 눈치채기 위해서다.
 */
export async function clearPushSubscription(endpoint: unknown): Promise<{ cleared: number }> {
  const me = await requireSessionMember();

  const address = typeof endpoint === "string" ? endpoint.trim() : "";
  // 주소가 없으면 **전체를 지우지 않는다.** "무엇도 모르고 지운다" 는 예전 사고 그대로다 —
  // 널 포인터에서 넘어온 값이 이 모양이고, 결과는 휴대폰 알림이 조용히 사라지는 것이었다.
  if (!address) {
    revalidatePath("/home/notifications");
    return { cleared: 0 };
  }

  const gone = await db.pushSubscription.deleteMany({
    where: { memberId: me.id, endpoint: address },
  });

  revalidatePath("/home/notifications");
  return { cleared: gone.count };
}
