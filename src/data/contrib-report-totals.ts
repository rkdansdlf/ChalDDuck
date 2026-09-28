/**
 * 18 리포트의 **집계** — 어느 기록이 어느 칸에 들어가는지.
 *
 * ## 왜 이 파일 따로 있나
 *
 * `data/api.ts` 는 Next 런타임을 끌어들인다(`next/headers`) 그래서 `scripts/smoke.mts` 가 그
 * 파일의 함수를 **불러서 검사할 수 없다.** 리포트는 성적 근거 문서인데 세는 규칙이
 * 화면 밖에만 있으면 "기여 기록 건수는 역할 수정을 해도 그대로여야 한다" 같은 회귀를 못 잡는다.
 *
 * 그래서 **어느 칸에 넣는지만** 순수 함수로 빼서(`last-message.ts` · `accepted-roles.ts` 와
 * 같은 이유) 실제 DB 행을 넣어 직접 돌린다. 조회는 `data/api.ts` 에 그대로 둔다.
 *
 * ## 숫자가 아니라 행을 받는다
 *
 * DB 가 이미 `groupBy` 로 묶어 준다(기록을 통째로 읽지 않는다). 이 함수는 그 묶음들을
 * 사람별로 모으기만 한다 — **판단은 여기 없다.** 모으는 곳이 두 군데로 나뉘면 목록마다
 * 숫자가 어긋난다.
 */

/** 리포트 한 줄의 숫자들. `who` · `left` · `role` 은 사람이 읽는 값이라 여기 없다. */
export type ContribTotals = {
  confirmed: number;
  pending: number;
  disputed: number;
  participations: number;
  unresolved: number;
};

export const ZERO_TOTALS: ContribTotals = {
  confirmed: 0,
  pending: 0,
  disputed: 0,
  participations: 0,
  unresolved: 0,
};

/** `groupBy` 가 돌려주는 한 줄. 상태별 집계에 쓴다. */
export type StateBucket = { memberId: string; state: string; n: number };
/** 사람별 이미 합쳐진 수. */
export type MemberCount = { memberId: string; n: number };

export function contribTotals(input: {
  /** `ContribRecord` 를 상태별로 센 것. */
  states: readonly StateBucket[];
  /** 기록 하나당 "현재 표시 중인 참여 표시" 수. */
  shownPerRecord: readonly MemberCount[];
  /** "답이 없어 닫힌 의견" 인 기록을 사람별로 센 것. */
  unresolved: readonly MemberCount[];
}): Map<string, ContribTotals> {
  const byMember = new Map<string, ContribTotals>();

  const slotOf = (memberId: string) => {
    const found = byMember.get(memberId);
    if (found) return found;
    const fresh = { ...ZERO_TOTALS };
    byMember.set(memberId, fresh);
    return fresh;
  };

  for (const row of input.states) {
    const bucket = slotOf(row.memberId);
    // 모르는 상태는 **어디에도 넣지 않는다.** 모르는 칸에 몰아 넣으면 숫자가 세고 도는
    // 사람이 아닌 기록이 된다. 상태 값은 화면 어휘(`STATUS`)와 같은 세 개뿐이다.
    if (row.state === "ok") bucket.confirmed += row.n;
    else if (row.state === "pending") bucket.pending += row.n;
    else if (row.state === "disputed") bucket.disputed += row.n;
  }

  // 참여 표시는 **기록 주인** 몫이다 — 찍은 팀장이 아니라 그 기록을 만든 사람에게 더한다.
  for (const row of input.shownPerRecord) slotOf(row.memberId).participations += row.n;
  // 정리되지 않은 의견도 **기록 주인** 몫이다.
  for (const row of input.unresolved) slotOf(row.memberId).unresolved += row.n;

  return byMember;
}
