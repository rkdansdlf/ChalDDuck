import "server-only";

import { db } from "@/server/db";
import { notify, teamMemberIds } from "@/server/notify/create";
import { whenText } from "@/features/schedule/meeting-cell";

/**
 * 마감이 지난 제안을 확정으로 바꾼다 — **예약 작업이 부르는 자리.**
 *
 * 서버 액션이 아니라 평범한 서버 모듈로 둔다. `"use server"` 파일에 넣으면 누구나
 * POST 로 부를 수 있는 입구가 하나 더 생기는데, 이 함수는 사람이 아니라 스케줄러가
 * 부르는 것이라 세션 확인이 없다.
 *
 * 화면은 `effectiveStage()` 로 이미 확정된 것처럼 보여 준다. 그래도 표를 고치는 이유는,
 * "언제 확정됐는지"를 나중에 묻거나 알림을 붙이려면 상태가 실제로 남아 있어야 하기 때문이다.
 *
 * ## 왜 알린다
 *
 * **푸시보다 더 큰 문제가 먼저 있었다 — 앱 안 알림조차 없었다.** 회의가 잡혔는데 아무한테도
 * 알려지지 않는다면, 팀원은 달력에 적힌 시간을 먼저 찾아내야 한다. 이 앱에서 회의는
 * 화면(24)이 있는 쪽에 있는 일인데, 그 화면은 아무도 방문하지 않는다.
 *
 * 그래서 확정된 팀원에게 `notify()` 로 알린다. `context: { settled: true }` 를 함께 넘겨
 * "이미 끝난 일"로 표시한다 — `notify/policy.ts` 가 이걸 보고 앱 밖으로는 보내지 않는다.
 * 닫혀 가는 결정에 밖으로 소리를 지르는 건 예의가 아니라 소음이므로.
 *
 * ## 두 번 돌려도 알림은 두 번 가지 않는다
 *
 * 예약 작업은 **같은 일을 두 번 부를 수 있다**(재시도, 겹친 트리거). 알림은 되돌릴 수 없으니
 * 이 중복이 그대로 사용자에게 보인다. 그래서 알림의 근거를 "찾아낸 것"이 아니라
 * **"이 호출이 실제로 뒤집은 것"**으로 둔다.
 *
 * 갱신 조건에 `stage: "proposed"` 를 다시 넣어 두 번째 실행은 아무것도 뒤집지 못하고,
 * 뒤집힌 줄만 `updateManyAndReturn` 로 받아 알린다. 동시에 두 번 돌아도 각 행은 한 번만
 * 넘어가므로 알림도 한 번만 간다.
 *
 * ## `revalidatePath` 는 여기 있지 않다
 *
 * 캐시를 지우는 것은 **요청의 경계에서 하는 일**이다. `revalidatePath` 는 요청 밖(예약 작업
 * 모듈을 직접 부르거나, 검증 스모크가 돌릴 때)에서 부르면 곧바로 던진다
 * (`Invariant: static generation store missing`). 그래서 화면을 다시 그리는 일은 이 호출자의
 * 책임이다 — `app/api/cron/meetings/route.ts` 가 부른 자리에서 한다.
 *
 * @returns 확정으로 바꾼 제안 수.
 */
export async function confirmDueMeetings(): Promise<number> {
  const due = await db.meetingProposal.findMany({
    where: { stage: "proposed", respondBy: { lte: new Date() } },
    select: { id: true },
  });
  if (due.length === 0) return 0;

  // 반대가 하나라도 있으면 확정하지 않는다 — 규칙은 여기서도 같다.
  const objected = await db.meetingResponse.findMany({
    where: { proposalId: { in: due.map((p) => p.id) }, agree: false },
    select: { proposalId: true },
  });
  const blocked = new Set(objected.map((r) => r.proposalId));
  const confirmable = due.filter((p) => !blocked.has(p.id)).map((p) => p.id);

  if (confirmable.length === 0) return 0;

  const claimed = await db.meetingProposal.updateManyAndReturn({
    where: { id: { in: confirmable }, },
    // **키를 함께 비운다.** 확정된 회의는 끝난 결정이지 "진행 중인 결정"이 아니다. 키를
    // 붙여 두면 팀이 두 번째 회의를 영영 잡지 못한다 — `assertCanPropose` 가 계속 막고,
    // 화면도 제안을 띄울 칸을 열지 않는다. 유일 인덱스가 지킨 것은 **응답을 기다리는** 결정
    // 하나뿐이다. 확정 행은 그대로 남는다(날짜·시간·제안자가 남는다).
    data: { stage: "confirmed", activeKey: null },
    select: {
      id: true,
      teamId: true,
      date: true,
      // 제안자는 알림에서 빠진다 — 자기 제안이 확정된 것은 이미 알고 있다.
      proposedById: true,
      slot: { select: { day: true, time: true } },
    },
  });

  // **팀별로 한 번씩** 알린다. 한 번에 몰아 보내면 팀 단위 알림이 사라져서, 누가 어느
  // 팀의 회의가 확정되었는지 알 수 없다.
  const byTeam = new Map<string, typeof claimed>();
  for (const p of claimed) {
    byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);
  }

  for (const [teamId, proposals] of byTeam) {
    for (const p of proposals) {
      await notify({
        to: await teamMemberIds(teamId),
        kind: "meeting",
        title: "회의가 확정되었습니다",
        // 날짜를 모르면 요일로만 말한다 — 없는 정보를 지어내지 않는다(`whenText`).
        body: `${whenText(p.date, p.slot?.day ?? "", p.slot?.time ?? "")} · 아무도 반대하지 않아 확정됐어요`,
        href: "/schedule",
        actorId: p.proposedById,
        // 이미 끝난 결정. 앱 안 알림함에 남되 밖으로는 보내지 않는다.
        context: { settled: true },
      });
    }
  }

  return claimed.length;
}