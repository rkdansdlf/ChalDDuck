import "server-only";

import { db } from "@/server/db";
import { pushTo } from "@/server/notify/push";

/**
 * 알림을 남긴다.
 *
 * 앱 안 알림함이 먼저다 — 놓치는 일의 대부분은 "나한테 온 줄 몰랐다"라서, **앱을 열면
 * 반드시 보이는 자리**를 먼저 채운다. 그 위에, 앱을 닫아 둔 사이에도 닿도록 푸시를 한 번 더
 * 보낸다(`pushTo`). 푸시는 언제든 세팅되지 않은 배포(키 없음)나 죽은 구독 때문에 실패해도
 * 앱 안 알림은 이미 쌓여 있으므로, 이 함수는 발신 때문에 거절되지 않는다.
 *
 * 액션들이 각자 `db.notification.create` 를 부르지 않고 이 함수를 지나게 한 이유:
 * 자기 자신에게 보내지 않는다는 규칙과 "나간 사람에게는 보내지 않는다"를 한 곳에서 지킨다.
 */
export type NotifyKind =
  | "poke"
  | "meeting"
  | "schedule-ask"
  | "contrib-dispute"
  | "contrib-confirm"
  | "join-request"
  | "rejoin-request"
  | "icebreak"
  /** 팀원이 드라이브에 올리거나 복원했다. */
  | "drive";

export async function notify(input: {
  /** 받는 사람들. 비어 있으면 아무 일도 하지 않는다. */
  to: string[];
  kind: NotifyKind;
  title: string;
  body: string;
  href?: string;
  /** 보낸 사람. 자기 자신은 받는 사람에서 빠진다. */
  actorId?: string;
}): Promise<void> {
  const recipients = [...new Set(input.to)].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return;

  // 팀을 나간 사람에게는 보내지 않는다. 행은 남아 있어도 팀원은 아니다.
  const active = await db.member.findMany({
    where: { id: { in: recipients }, leftAt: null },
    select: { id: true },
  });
  if (active.length === 0) return;

  await db.notification.createMany({
    data: active.map((m) => ({
      memberId: m.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      href: input.href ?? null,
      actorId: input.actorId ?? null,
    })),
  });

  // 앱 밖으로도 같은 알림을 보낸다. 실패해도 앱 안 알림함에는 이미 쌓였고, 여기서 던져
  // 잡히지 않는다(`pushTo` 는 몇 개 나갔는지만 돌려준다).
  await pushTo(
    active.map((m) => m.id),
    { title: input.title, body: input.body, href: input.href },
  );
}

/** 팀의 다른 사람들. 회의 제안처럼 전원에게 알릴 때 쓴다. */
export async function teamMemberIds(teamId: string): Promise<string[]> {
  const members = await db.member.findMany({
    where: { teamId, leftAt: null },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

/** 팀장. 가입·재입장 승인 요청을 받는다. */
export async function leaderIds(teamId: string): Promise<string[]> {
  const leaders = await db.member.findMany({
    where: { teamId, isLeader: true, leftAt: null },
    select: { id: true },
  });
  return leaders.map((m) => m.id);
}
