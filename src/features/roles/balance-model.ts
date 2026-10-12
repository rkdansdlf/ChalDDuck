import type { Role, RoleKey } from "@/lib/types";

/**
 * 07 균형 배정 추천의 계산 규칙 — 서버(`actions/roles`)와 화면이 **같은 함수**를 쓴다.
 *
 * 추첨(`drawPoolOf`)은 "희망한 사람 중 누구냐" 를 운으로 정한다. 이쪽은 **모두가 핵심 업무를 하나씩
 * 맡고, 시간이 한 사람에게 몰리지 않게** 안을 짠다. 둘은 길이 다르다 — 추첨은 겹침을 풀고, 추천은
 * 아직 정해지지 않은 역할 전부를 한꺼번에 본다.
 *
 * ## 추천은 결정이 아니다
 *
 * 결과는 `RoleDraw`(받기 대기)로 올라가고, **당사자가 받아야** 확정된다. 안 받으면 그 사람은 그
 * 역할의 다음 추천에서 빠진다(`RoleRejection`). 그래서 이 함수는 **강제할 수 없는 사람을 고르지
 * 않는다** — 피할 역할로 고른 사람과 이미 안 받은 사람은 후보가 아니다. 희망한 사람이 없어도 후보는
 * 남지만, 그 사실을 이유(`no-wish`)로 밝혀 받기 전에 이야기하게 한다.
 *
 * ## 점수
 *
 * 기획안에 정해진 가중치는 없다. 아래 상수는 **임시로 둔 값**이고, 이 값들이 바뀌면 `smoke.mts` 의
 * 균형 검사가 함께 본다. 순서(희망 > 핵심 처음 맡기 > 부담)가 아니라 **합산**인 이유: 희망만 따르면 한
 * 사람에게 몰리고, 부담만 따르면 아무도 원하는 일을 못 한다.
 *
 * 역할을 하나씩 채우므로 **기회비용**도 뺀다 — 뒤에 남은 역할을 더 원하는 사람에게 앞 역할을 먼저
 * 주면, 그 사람은 원하던 역할 차례가 올 때 이미 부담을 진 채라 밀린다(처음 구현에서 실제로 났다).
 *
 * `MBTI`·가능한 시간은 읽지 않는다(제품 약속) — 희망·Veto·예상 시간·지금 맡은 일만 본다.
 */
export const BALANCE_WEIGHTS = {
  /** 1순위로 고른 역할. */
  wantFirst: 3,
  /** 두 번째로 고른 역할. */
  wantSecond: 1.5,
  /** 핵심 업무가 아직 하나도 없는 사람에게 핵심 역할을 주는 것. */
  firstCore: 2,
  /** 맡은 뒤 부담 / 한 사람당 목표. 1 이면 딱 목표만큼이고, 클수록 감점이 커진다. */
  load: 2,
} as const;

/** 균형 추천이 `RoleDraw.tool` 에 남기는 이름 — 화면에 그대로 보인다. */
export const BALANCE_TOOL = "균형 추천";

/** 추천이 이 사람을 고른 이유 — 화면이 한 칩씩 말한다. */
export type BalanceReason = "want" | "want2" | "no-wish" | "first-core" | "light-load";

export type BalanceMember = {
  id: string;
  name: string;
  want: RoleKey | null;
  want2: RoleKey | null;
  veto: RoleKey | null;
};

export type BalanceSuggestion = {
  role: RoleKey;
  memberId: string;
  name: string;
  reasons: BalanceReason[];
};

const KIND_ORDER = { core: 0, ops: 1, support: 2 } as const;

/**
 * 한 역할의 무게. **모든 역할에 예상 시간이 있을 때만** 시간을 쓴다 — 일부만 있으면 적힌 역할만
 * 무거워 보인다. 하나라도 비었으면 전부 1(역할 수)로 센다.
 */
export function roleWeights(
  roles: Role[],
  estimates: Partial<Record<RoleKey, number>>,
): Record<RoleKey, number> {
  const all = roles.length > 0 && roles.every((r) => estimates[r.key] !== undefined);
  return Object.fromEntries(roles.map((r) => [r.key, all ? (estimates[r.key] as number) : 1])) as Record<
    RoleKey,
    number
  >;
}

export function recommendBalance(input: {
  roles: Role[];
  members: BalanceMember[];
  /** 이미 누군가에게 걸린 역할(확정 또는 받기 대기) → 사람 id. 새 추천의 부담에 함께 센다. */
  held: Partial<Record<RoleKey, string>>;
  /** 새로 채울 역할. */
  open: readonly RoleKey[];
  /** 역할별로 안 받은 사람 id. */
  rejected: Partial<Record<RoleKey, ReadonlySet<string>>>;
  estimates: Partial<Record<RoleKey, number>>;
}): BalanceSuggestion[] {
  const { roles, held, rejected, estimates } = input;
  // 결과가 입력 순서에 기대지 않게 한다 — 화면은 명단 순서, 서버는 DB 순서로 읽는다.
  const members = [...input.members].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (members.length === 0) return [];

  const weight = roleWeights(roles, estimates);
  const roleOf = new Map(roles.map((r, i) => [r.key, { role: r, index: i }]));
  const perCapita = Math.max(
    1e-9,
    roles.reduce((sum, r) => sum + weight[r.key], 0) / members.length,
  );

  const load = new Map(members.map((m) => [m.id, 0]));
  const core = new Map(members.map((m) => [m.id, 0]));
  for (const [key, holder] of Object.entries(held) as [RoleKey, string][]) {
    const info = roleOf.get(key);
    if (!info || !load.has(holder)) continue;
    load.set(holder, (load.get(holder) ?? 0) + weight[key]);
    if (info.role.kind === "core") core.set(holder, (core.get(holder) ?? 0) + 1);
  }

  // 핵심부터, 무거운 것부터 — 핵심을 먼저 나눠야 모두에게 하나씩 돌아가고, 무거운 것을 먼저
  // 놓아야 작은 일로 균형을 맞출 여지가 남는다.
  const queue = input.open
    .map((key) => roleOf.get(key))
    .filter((x): x is { role: Role; index: number } => x !== undefined)
    .sort(
      (a, b) =>
        KIND_ORDER[a.role.kind] - KIND_ORDER[b.role.kind] ||
        weight[b.role.key] - weight[a.role.key] ||
        a.index - b.index,
    );

  // 한 사람이 어느 역할을 얼마나 원하는가.
  const wishWeight = (m: BalanceMember, key: RoleKey) =>
    m.want === key ? BALANCE_WEIGHTS.wantFirst : m.want2 === key ? BALANCE_WEIGHTS.wantSecond : 0;

  const out: BalanceSuggestion[] = [];
  for (const [at, { role }] of queue.entries()) {
    const later = queue.slice(at + 1).map((q) => q.role.key);
    const banned = rejected[role.key];
    const candidates = members.filter((m) => m.veto !== role.key && !banned?.has(m.id));
    if (candidates.length === 0) continue;

    const minLoad = Math.min(...candidates.map((m) => load.get(m.id) ?? 0));
    const scored = candidates.map((m) => {
      const before = load.get(m.id) ?? 0;
      const needsCore = role.kind === "core" && (core.get(m.id) ?? 0) === 0;
      const wish = m.want === role.key ? "want" : m.want2 === role.key ? "want2" : null;
      // **기회비용.** 이 사람이 뒤에 남은 역할을 더 원한다면 지금 이 역할을 주지 않는다 — 앞 역할을
      // 아무에게나 먼저 놓으면, 그 역할을 원하던 사람이 이미 다른 일을 진 채로 뒷 차례를 맞는다.
      // 단, 그 역할을 **나보다 더 원하는 사람**이 있으면 어차피 내 몫이 아니다 — 양보할 이유가 없다.
      const forgone = Math.max(
        0,
        ...later
          .filter((key) => m.veto !== key && !rejected[key]?.has(m.id))
          .filter((key) =>
            members.every(
              (o) =>
                o.id === m.id || o.veto === key || rejected[key]?.has(o.id) || wishWeight(o, key) <= wishWeight(m, key),
            ),
          )
          .map((key) => wishWeight(m, key)),
      );
      const score =
        wishWeight(m, role.key) +
        (needsCore ? BALANCE_WEIGHTS.firstCore : 0) -
        BALANCE_WEIGHTS.load * ((before + weight[role.key]) / perCapita) -
        forgone;
      return { m, before, needsCore, wish, score };
    });

    // 동점이면 부담이 적은 쪽, 그다음은 id 순서 — 같은 입력은 늘 같은 답이다.
    scored.sort((a, b) => b.score - a.score || a.before - b.before);
    const best = scored[0];

    const reasons: BalanceReason[] = [];
    if (best.wish === "want") reasons.push("want");
    else if (best.wish === "want2") reasons.push("want2");
    else reasons.push("no-wish");
    if (best.needsCore) reasons.push("first-core");
    // 모두 같은 부담이면 "적다" 는 말이 사실이 아니다 — 다른 후보보다 실제로 가벼울 때만 말한다.
    if (best.before === minLoad && scored.some((s) => s.before > minLoad)) reasons.push("light-load");

    out.push({ role: role.key, memberId: best.m.id, name: best.m.name, reasons });
    load.set(best.m.id, best.before + weight[role.key]);
    if (role.kind === "core") core.set(best.m.id, (core.get(best.m.id) ?? 0) + 1);
  }

  // 화면은 역할 목록 순서로 보여 준다.
  return out.sort((a, b) => (roleOf.get(a.role)?.index ?? 0) - (roleOf.get(b.role)?.index ?? 0));
}

/** 추첨 결과 중 계획에 필요한 만큼 — 화면의 `RoleDrawResult` 와 서버 DB 행이 모두 이 모양으로 줄어든다. */
export type PlanDraw = { winnerId: string; accepted: boolean; stale: boolean };

/**
 * 지금 상태에서 **새로 채울 역할**을 정해 추천한다 — 화면 미리보기와 서버 액션이 같은 함수를 부른다.
 *
 * - 확정되었거나 받기 대기인 역할은 **그 사람의 부담으로 센다**(채우지 않는다).
 * - 당첨자가 나간 **받기 전** 추첨은 무효라 다시 채운다. 이미 확정된 것은 건드리지 않는다.
 * - 팀 동의를 받는 중인 역할은 비워 둔다 — 동의를 올린 사람의 추첨을 가로채지 않는다.
 */
export function balancePlan(input: {
  roles: Role[];
  members: BalanceMember[];
  draws: Partial<Record<RoleKey, PlanDraw>>;
  liveConsent: ReadonlySet<RoleKey>;
  rejected: Partial<Record<RoleKey, ReadonlySet<string>>>;
  estimates: Partial<Record<RoleKey, number>>;
}): BalanceSuggestion[] {
  const held: Partial<Record<RoleKey, string>> = {};
  const open: RoleKey[] = [];
  for (const role of input.roles) {
    const draw = input.draws[role.key];
    if (!draw) {
      if (!input.liveConsent.has(role.key)) open.push(role.key);
    } else if (draw.accepted || !draw.stale) {
      held[role.key] = draw.winnerId;
    } else if (!input.liveConsent.has(role.key)) {
      open.push(role.key);
    }
  }
  return recommendBalance({
    roles: input.roles,
    members: input.members,
    held,
    open,
    rejected: input.rejected,
    estimates: input.estimates,
  });
}
