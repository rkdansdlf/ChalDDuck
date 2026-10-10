import "server-only";

import { db } from "@/server/db";
import { isInviteUsable } from "./rules";
import type { PrismaClient } from "@/generated/prisma";

/**
 * 팀장의 가입 요청 처리를 **한 트랜잭션**으로 묶는다.
 *
 * ⚠️ 서버 액션 파일에 두면 안 된다. `"use server"` 안에서는 누구나 이 함수에 임의의
 * `requestId` 를 POST 해 남의 팀 가입 요청을 승인할 수 있다. 팀장인지 먼저 확인한 뒤에만
 * 부른다(`actions/rejoin.ts` 가 그렇게). `auth/issue.ts` 와 같은 이유다.
 *
 * `client` 를 받는 것은 `db.$transaction` 안의 `tx` 를 넘기려고도 있고, **smoke 가 이
 * 함수를 그대로 부르게 하려고**다 — 서버 액션은 쿠키가 필요해서 부르면 "액션이 우회된"
 * 테스트가 되지만, 여기는 순수 DB 연산이므로 그대로 부를 수 있다.
 *
 * ## 무엇을 하나의 경계로 묶는가
 *
 * ```
 * BEGIN
 *   JoinRequest FOR UPDATE      ← 경합의 시작점
 *   아직 pending 인지 다시 본다
 *   같은 이름이 이미 팀에 있나    ← 있으면 여기서 멈춘다 (아래 "name-taken")
 *   TeamInvite  FOR UPDATE      ← 자리가 차는 것을 정확히 한 번만 세기 위해
 *   초대가 아직 쓸 만한지 다시 본다
 *   JoinRequest → approved | rejected
 *   TeamInvite.useCount += 1    ← 쓸 수 있을 때만
 * COMMIT
 * ```
 *
 * **잠근 다음에 다시 읽는 것이 요점이다.** 잠그기 전에 "아직 pending 이지"를 읽으면,
 * 두 번 누른 팀장 두 손이 모두 통과해 둘 다 승인하고 자리를 두 번 센다. 잠근 **뒤에** 읽어야
 * 두 번째가 `pending` 이 아닌 것을 본다.
 */
export async function settleJoinRequest(
  input: {
    requestId: string;
    /** 이 요청이 속한 팀. 팀장 세션에서 온 값이라 클라이언트가 정할 수 없다. */
    teamId: string;
    approverId: string;
    approve: boolean;
  },
  client: Pick<PrismaClient, "$transaction"> = db,
): Promise<"ok" | "gone" | "stale-invite" | "name-taken"> {
  return client.$transaction(async (tx) => {
    // **우리 팀의 요청인지 먼저 좁힌 다음** 잠근다. 남의 팀 요청을 잠가 두면 팀장 한 명이
    // 자기 화면에 없는 요청을 계속 누르는 것만으로 남의 팀이 잠긴다.
    const visible = await tx.joinRequest.findFirst({
      where: { id: input.requestId, teamId: input.teamId },
      select: { id: true, inviteId: true },
    });
    if (!visible) return "gone";

    await tx.$queryRaw`SELECT 1 FROM "JoinRequest" WHERE "id" = ${visible.id} FOR UPDATE`;

    // 잠근 **뒤에** 상태를 본다. `pending` 이 아니면 이미 처리된 것이고, 되돌리지 않는다.
    const request = await tx.joinRequest.findFirst({
      where: { id: visible.id, teamId: input.teamId, status: "pending" },
      select: { id: true, inviteId: true, name: true },
    });
    if (!request) return "gone";

    /**
     * **같은 이름이 이미 팀에 있으면 승인하지 않는다** (2026-09-28).
     *
     * `Member` 에 `@@unique([teamId, name])` 이 있어서 멤버를 만들 때 반드시 걸린다. 근데 그
     * 제약은 **요청한 브라우저**(`checkJoinApproval`)가 팀원이 되는 순간에 터진다 — 즉
     * **승인은 끝났는데** 팀원이 되지 못하는, 되돌릴 수 없는 상태다. 그리고 예전 그 곳의
     * 처리는 이 예외를 "폴링이 겹쳤다" 로만 읽고 요청을 지워 버렸다. 신청인은 아무 설명
     * 없이 다시 처음부터, 팀장 목록에서는 이미 사라진 요청을 갖게 된다(실측).
     *
     * 그래서 **승인하는 자리에서** 막는다. 여기서 막으면 세 가지를 모두 얻는다 —
     * ① `pending` 이 그대로라 신청인이 자기 요청을 고쳐 다시 보낼 수 있다(요청 소유자는
     * 값을 고칠 수 있다 — `actions/onboarding.ts`). ② 팀장 화면에 **무슨 일이 있었는지**가
     * 보인다. ③ 되돌릴 수 없는 상태에 한 번도 가지 않는다.
     *
     * 해법은 예외에 맡기지 않고 **먼저 물어본다.** 예외 문구로 분기하면 같은 제약 위반이
     * 다른 이유(동시 폴링)일 때 구분할 수 없다.
     */
    if (input.approve) {
      // ⚠️ **동명이인 작업 2단계에서 이 게이트가 바뀐다.** 같은 이름이 둘일 수 있게 되면
      // "이미 있으면 승인하지 않는다" 는 규칙 자체가 사라진다 — 지금은 스키마의
      // `@@unique([teamId, name])` 이 있어 그대로 둔다.
      const nameTaken = await tx.member.findFirst({
        where: { teamId: input.teamId, name: request.name },
        select: { id: true },
      });
      if (nameTaken) return "name-taken";
    }

    let stale = false;
    if (input.approve && request.inviteId) {
      await tx.$queryRaw`SELECT 1 FROM "TeamInvite" WHERE "id" = ${request.inviteId} FOR UPDATE`;
      const invite = await tx.teamInvite.findUnique({ where: { id: request.inviteId } });

      // **쓸 수 있으면 자리를 한 칸 쓴다. 쓸 수 없으면 승인은 그대로 하고 자리는 안 센다.**
      //
      // 승인을 막지는 않는다. 초대가 폐기되거나 만료된 건 **팀장 자신의 행동**이거나 시간의
      // 결과지, 이 신청 사람이 어긋난 게 아니다. 여기서 막으면 팀장이 링크를 껐다고
      // 이미 들어와 있던 사람의 승인을 못 하는 상태에 갇힌다 — 되돌릴 수 없는 일이면
      // 그래도 멈춰 세우는 편이 낫지만, 이건 그렇지 않다.
      //
      // 대신 팀장에게 **말해 준다**(`"stale-invite"`) — 승인은 반영됐지만 이 초대는 이미 닫혔고
      // 더 이상 쓰이지 않는다는 사실은 숨기지 않는다.
      if (invite && isInviteUsable(invite)) {
        await tx.teamInvite.update({
          where: { id: invite.id },
          data: { useCount: { increment: 1 } },
        });
      } else {
        stale = true;
      }
    }

    await tx.joinRequest.update({
      where: { id: request.id },
      data: {
        status: input.approve ? "approved" : "rejected",
        resolvedAt: new Date(),
        approvedById: input.approverId,
      },
    });

    return stale ? "stale-invite" : "ok";
  });
}
