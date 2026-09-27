import "server-only";

import webpush from "web-push";
import { db } from "@/server/db";
import { pushFailure, pushPayload } from "@/features/home/push-model";

/**
 * 앱 밖으로 알림을 보내는 통로.
 *
 * 앱 안 알림함이 있는 자리에 같은 알림을 한 번 더 보내는 것이라, **앱 안 알림이 먼저다.**
 * 여기서 뭐가 나거나 실패해도 그 자리에는 이미 알림이 쌓여 있다 — 그래서 이 모듈은 예외를
 * 밖으로 던지지 않는다. 발신은 늘 성공한 척이 아니라, 실제로 몇 개가 나갔는지만 돌려준다.
 */

/** 발신 키(VAPID)가 설정돼 있는가. 없으면 화면이 "아직 연결되지 않았다"고 그대로 말한다. */
export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configuredFor: string | null = null;

/**
 * `web-push` 에 키를 한 번만 심는다.
 *
 * 모듈이 처음 불린 시점에 키가 없으면(설정 없이 뜬 배포) 나중에 채워져도 다시 보지 않는다 —
 * 키는 배포 환경이므로 프로세스 안에서 바뀌지 않는다.
 */
function ready(): boolean {
  if (!pushConfigured()) return false;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:team@chalddeok.app";
  if (configuredFor !== subject) {
    webpush.setVapidDetails(
      subject,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    configuredFor = subject;
  }
  return true;
}

export type PushResult = {
  /** 실제로 나간 통 수. */
  sent: number;
  /** 발신기가 버린 통 수(자격 증명 만료, 너무 큰 본문 등). 지우지 않고 두고 다시 시도한다. */
  failed: number;
  /** 더 이상 존재하지 않는 단말이라 지운 구독 수. */
  gone: number;
  /** 발신 키가 없어 아무것도 하지 않았는지. */
  skipped: boolean;
};

/** 이 사람들에게 알림 한 통을 보낸다. */
export async function pushTo(
  memberIds: string[],
  input: { title: string; body: string; href?: string | null },
): Promise<PushResult> {
  const none: PushResult = { sent: 0, failed: 0, gone: 0, skipped: true };
  if (memberIds.length === 0 || !ready()) return none;

  // 팀을 나간 사람에게는 보내지 않는다 — 행이 남아 있어도 팀원은 아니다(`notify` 와 같은 규칙).
  const subs = await db.pushSubscription.findMany({
    where: { memberId: { in: memberIds }, member: { leftAt: null } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return { ...none, skipped: false };

  const payload = JSON.stringify(pushPayload(input));

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ),
    ),
  );

  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      sent += 1;
      return;
    }
    const status = (r.reason as { statusCode?: number } | null)?.statusCode;
    // 404·410 만 지운다 — 서명이 잘못된(401) 때 정상 기기까지 지우면 끝이 없다.
    if (pushFailure(status) === "gone") gone.push(subs[i].id);
    else failed += 1;
  });

  if (gone.length > 0) {
    await db.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  }

  return { sent, failed, gone: gone.length, skipped: false };
}
