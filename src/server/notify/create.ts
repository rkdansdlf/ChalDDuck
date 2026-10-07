import "server-only";

import { db } from "@/server/db";
import { pushTo } from "@/server/notify/push";
import { pushDecision, pushPolicy, type NotifyContext, type NotifyKind } from "@/server/notify/policy";

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
  //
  // ⚠️ **문자열을 참·거짓으로 보지 않는다.** `pushPolicy` 는 `"push" | "in-app-only"` 두 값을
  // 돌려주고 **둘 다 참인 문자열**이다. 예전에는 `if (!(input.push ?? pushPolicy(…))) return;`
  // 이었는데, 그 검사는 **한 번도 걸리지 않았다** — 정책이 "앱 안에만" 이라고 적어 둔 네 종류
  // (`drive`·`icebreak`·`who-does-it`·`contrib-participation`)가 전부 앱 밖으로 나갔고,
  // `settled` 문맥("회의가 잡혔습니다")까지 나갔다.
  //
  // 정책 파일에는 이유가 길게 적혀 있었다 — 잦은 알림이 "알림을 끄고 싶다"를 만들고, 끄는 순간
  // **부르지 않아야 할 알림까지 함께 죽는다**는 것. 그 판단이 통째로 우회되고 있었다.
  //
  // 검사는 `pushPolicy` 의 **반환값만** 보고 있었다("함수가 올바른가"). 호출부가 그 값을 지키는지는
  // 아무도 안 봤다 — 이 저장소가 전에 겪은 모양(`getDmThreads` 가 `distinct` 를 직접 읽던 일)과 같다.
  const decision = pushDecision(input.kind, input.context, input.push);
  if (decision !== "push") {
    /**
     * **접은 것도 한 줄 남긴다 — 다만 시끄럽지 않게.**
     *
     * 기기 시험에서 "알림이 안 왔다"의 원인은 셋인데 구분할 방법이 없었다: 정책이 접었는가 ·
     * 보냈는데 못 받았는가 · 구독이 없는가. 셋째는 `npm run push:subs` 가 답하고, 나머지 둘은
     * **서버 로그에만** 남을 수 있는데 아무것도 안 남겼다.
     *
     * 그래서 남기되 **종류의 기본값이 "보냄" 인데 이번에 접은 경우만** 적는다. 원래부터 앱 안에만
     * 두기로 한 종류까지 적으면 로그가 그것으로 채워져 진짜 원인을 못 본다.
     */
    if (pushPolicy(input.kind) === "push") {
      console.log(
        `[push] ${input.kind} · 접음 (${input.push === false ? "보낼 자리 없음" : "이미 끝난 일"})`,
      );
    }
    return;
  }
  const pushed = await pushTo(
    active.map((m) => m.id),
    { title: input.title, body: input.body, href: input.href },
  );
  // **시도한 것은 항상 남긴다.** 이 줄이 기기 시험의 유일한 증인이다 — 몇 통을 보려 했고
  // 몇 통이 나갔는지. `죽은 구독` 은 지워진 404·410 이다.
  console.log(
    `[push] ${input.kind} · 대상 ${active.length} · 보냄 ${pushed.sent} · 실패 ${pushed.failed}` +
      ` · 죽은 구독 ${pushed.gone}${pushed.skipped ? " · 키 없음" : ""}`,
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
