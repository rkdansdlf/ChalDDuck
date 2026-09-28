import "server-only";

import { db } from "@/server/db";
import { pushTo } from "@/server/notify/push";
import { pushPolicy, type NotifyContext, type NotifyKind } from "@/server/notify/policy";

/**
 * 알림을 남긴다.
 *
 * 앱 안 알림함이 먼저다 — 놓치는 일의 대부분은 "나한테 온 줄 몰랐다"라서, **앱을 열면
 * 반드시 보이는 자리**를 먼저 채운다. 그 위에, 앱을 닫아 둔 사이에도 닫도록 푸시를 한 번 더
 * 보낸다(`pushTo`). 푸시는 언제든 세팅되지 않은 배포(키 없음)나 죽은 구독 때문에 실패해도
 * 앱 안 알림은 이미 쌓여 있으므로, 이 함수는 발신 때문에 거절되지 않는다.
 *
 * 액션들이 각자 `db.notification.create` 를 부르지 않고 이 함수를 지나게 한 이유:
 * 자기 자신에게 보내지 않는다는 규칙과 "나간 사람에게는 보내지 않는다"를 한 곳에서 지킨다.
 *
 * **푸시를 보낼지는 여기서 정하지 않는다** — `server/notify/policy.ts` 가 정하고, 여기서는 그것을
 * 기본값으로 쓴다. 호출부가 `push` 를 넘기는 것은 그 판정을 아는 경우뿐이다.
 */
export type { NotifyContext, NotifyKind } from "@/server/notify/policy";

export async function notify(input: {
  /** 받는 사람들. 비어 있으면 아무 일도 하지 않는다. */
  to: string[];
  kind: NotifyKind;
  title: string;
  body: string;
  href?: string;
  /** 보낸 사람. 자기 자신은 받는 사람에서 빠진다. */
  actorId?: string;
  /**
   * 같은 종류 안에서 갈리는 것. 회의가 "제안"(응답 필요)과 "확정"(이미 끝남)을 갈라 읽는다.
   */
  context?: NotifyContext;
  /**
   * 앱 밖 푸시를 보낼지. **없으면 정책이 정한다**(`notify/policy.ts`).
   *
   * 넘길 수 있는 곳은 두 군데뿐이다.
   * - **예산을 확인한 곳.** 팀장에게 가는 푸시는 횟수가 정해져 있고, 넘치면 앱 안 알림만
   *   남긴다(`rate-limit/join-throttle.ts` 의 `takePushSlot`). 정책이 "보내라"고 해도 자리가
   *   없으면 보내지 않는 것이 맞다 — **행은 그대로 둔다.** 지우면 팀장은 "누가 들어오려 했었지"
   *   를 알 수 없고, 그것이 바로 막으려던 공격의 목적이 된다.
   * - **정말 특수한 경우.** 정책이 다르게 말해야 하는데 이 자리가 이를 아는 곳.
   *
   * 넣기 전에 이 함수를 먼저 본다. 매번 자리에 넣기 시작하면 정책이 흩어져, 몇 달 뒤에
   * "왜 여기는 오고 여기는 안 오지" 가 되돌아온다.
   */
  push?: boolean;
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
  //
  // **판정은 정책이 한다.** 호출부가 `push` 를 명시한 경우에만 그걸 따른다 — 그건 이 자리가
  // 정책이 모르는 것을 안다는 뜻이기 때문이다(보통은 "지금 보낼 자리가 남았는가").
  if (!(input.push ?? pushPolicy(input.kind, input.context))) return;
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
