import type { Role, RoleKey, RoleWork } from "@/lib/types";

/**
 * 한 사람의 **맡은 역할**과 **그 역할로 쌓인 기여 기록** — 리포트가 둘을 나란히 놓는다.
 *
 * ## 왜 필요한가
 *
 * 역할을 맡았다는 사실(`RoleDraw.accepted`)과 실제로 한 일(`ContribRecord`)은 다른 이야기다. 둘이 한
 * 줄에 섞여 있으면 "자료조사 담당" 이라는 이름만으로 일을 한 것처럼 읽히고, 반대로 맡지 않은 역할의
 * 일을 대신한 사람은 보이지 않는다. 그래서 **역할마다** 기록을 세고, 맡았는데 확인된 기록이 없으면
 * 없다고 적는다.
 *
 * ## 점수가 아니다
 *
 * 비율·순위·평가어를 만들지 않는다 — 리포트의 첫 원칙(`ContribReportRow`)이다. 숫자는 기록 수 그대로이고,
 * 비교를 유도하지 않는다.
 *
 * ## 순수 함수인 이유
 *
 * `data/api.ts` 는 Next 런타임을 끌어들여 `scripts/smoke.mts` 가 부를 수 없다(`contrib-report-totals.ts` 와
 * 같은 이유). 세는 규칙을 직접 돌려 볼 수 있어야 한다.
 */
/** `groupBy(memberId, roleKey, state)` 가 돌려주는 한 줄. 한 사람의 것만 넘긴다. */
export type RoleStateBucket = { roleKey: string; state: string; n: number };

/**
 * @param roles 그 팀의 역할 목록(순서가 곧 화면 순서)
 * @param held 이 사람이 맡은(확정된) 역할 키들
 * @param buckets 이 사람의 기록을 (역할, 상태)별로 센 것
 *
 * 역할 목록에 없는 키(지워진 역할)의 기록은 **어느 역할로도 세지 않는다** — 없는 이름을 지어내지
 * 않는다. 맡지 않은 역할이라도 기록이 있으면 줄이 생긴다(`held: false`) — 대신한 일이 보이게.
 * 맡았으면 기록이 하나도 없어도 줄이 있다.
 */
export function roleWorkOf(
  roles: readonly Role[],
  held: readonly RoleKey[],
  buckets: readonly RoleStateBucket[],
): RoleWork[] {
  const heldSet = new Set(held);
  const counts = new Map<string, { confirmed: number; pending: number; disputed: number }>();
  for (const b of buckets) {
    const slot = counts.get(b.roleKey) ?? { confirmed: 0, pending: 0, disputed: 0 };
    // 모르는 상태는 어디에도 넣지 않는다(`contribTotals` 와 같은 규칙).
    if (b.state === "ok") slot.confirmed += b.n;
    else if (b.state === "pending") slot.pending += b.n;
    else if (b.state === "disputed") slot.disputed += b.n;
    counts.set(b.roleKey, slot);
  }

  const out: RoleWork[] = [];
  for (const role of roles) {
    const c = counts.get(role.key);
    const total = c ? c.confirmed + c.pending + c.disputed : 0;
    if (!heldSet.has(role.key) && total === 0) continue;
    out.push({
      key: role.key,
      name: role.name,
      kind: role.kind,
      held: heldSet.has(role.key),
      confirmed: c?.confirmed ?? 0,
      pending: c?.pending ?? 0,
      disputed: c?.disputed ?? 0,
    });
  }
  return out;
}
