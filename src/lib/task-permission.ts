/**
 * 할 일을 **누가 고칠 수 있는가** — 순수 규칙.
 *
 * ## 왜 액션 파일 밖에 있는가
 *
 * `"use server"` 파일은 **export 하나하나가 서버 액션**이 된다. 순수 판정 함수를 거기에
 * 두면 그 함수도 액션이 되어(`src/data/api.ts` 가 목록을 만들 때) 한 번 왕복하고, 무엇보다
 * "액션이 우회된" 코드가 된다. 이 파일은 DOM 도 DB 도 없고 `scripts/smoke.mts` 가 그대로
 * 불러 확인할 수 있다.
 *
 * ## 왜 이런 규칙인가 (2026-09-28)
 *
 * 예전에는 팀원 누구나 남의 할 일의 담당자를 바꿀 수 있었고, 그 사실은 화면 주석에만
 * 적혀 있었다. 막으려 해도 **`Task` 에 만든 사람이 없어서** 서버가 알 수 없었다 — 누가
 * 넣었는지 기록되지 않았기 때문이다. 그래서 `createdById` 를 넣었다(마이그레이션).
 *
 * `owner`(제출함)·`author`(파일 버전)처럼 **만든 사람**을 가진 자리는 이미 몇 곳 있다.
 * 여기까지 같은 기준을 맞추는 것이 일관성이고, "남에게 일을 떠맡기기는 되지만 조용히
 * 바뀌어 있는 것"은 막아야 한다.
 *
 * ## 주인이 없는(넣기 전부터 있던) 할 일
 *
 * 주인이 **누구인지 되돌릴 수 없다.** 지어내면 근거 없는 기록이 남고, 아무 말 없이
 * 비우면 그 할 일은 아무도 고칠 수 없게 된다 — 팀장에게도 말할 곳이 사라진다. 그래서
 * **팀장만** 고칠 수 있게 했다. 규칙에 예외가 하나 생기지만, 예외 없이 두면 `null` 이라는
 * 값이 아무 의미도 갖지 못한다.
 */
export type TaskEditBlock = "not-creator" | "leader-only" | null;

export function canEditTask(
  task: { createdById: string | null },
  me: { id: string; isLeader: boolean } | null,
): boolean {
  if (!me) return false;
  // 주인이 없으면(넣기 전부터 있던 할 일) 팀장에게만 연다.
  if (task.createdById === null) return me.isLeader;
  return task.createdById === me.id || me.isLeader;
}

/** 막혔을 때 **왜**인지. 화면이 그대로 문장으로 만들 수 있게 값으로 돌려준다. */
export function taskEditBlock(
  task: { createdById: string | null },
  me: { id: string; isLeader: boolean } | null,
): TaskEditBlock {
  if (canEditTask(task, me)) return null;
  if (task.createdById === null) return "leader-only";
  return "not-creator";
}

/**
 * 배정 알림을 **보내야 하는가** — 순수 판정.
 *
 * ## 왜 알림을 보내는가 (2026-09-28)
 *
 * 배정이 **조용했다.** 행만 쓰고 아무도 말하지 않았다 — 담당자는 자기 할 일 목록을 열어서야
 * 알게 됐고, 그 사이에 "안 받기로" 할 기회도 없었다. 앱이 다른 모든 변경(회의 확정·기여
 * 확인·콤 찌르기)은 말하는데 담당 배정만 조용했다.
 *
 * ## 무엇을 하지 않는가
 *
 * **배정을 미루지 않는다.** 수락을 기다리는 상태는 4명 팀에 절차가 되고, "안 받으면 언제까지"
 * 같은 새 정책이 한 벌 더 생긴다. 배정은 지금 바로 효력이 있고, 그 사실을 알려 주는 것으로
 * 끝낸다.
 *
 * - **이미 그 사람에게 있던 것을 다시 저장** → 넣을 때 이미 알았다.
 * - **담당자를 비움** → 돌아갈 사람이 없다.
 * - **나에게 배정** → `notify` 가 본인을 걸러 내지만, 의도가 그럴 리 없으므로 부르지 않는다.
 */
export function shouldNotifyAssignee(
  assigneeId: string | null,
  previousAssigneeId: string | null,
  meId: string,
): boolean {
  if (!assigneeId) return false;
  if (assigneeId === meId) return false;
  return assigneeId !== previousAssigneeId;
}
