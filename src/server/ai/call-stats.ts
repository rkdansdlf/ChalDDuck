import "server-only";

import { AI_POLICY } from "@/data/catalog";
import { db } from "@/server/db";

/**
 * AI 호출의 **하루 지표** — 도구 · 모델 · 지연 · 실패 · 거절.
 *
 * ## 왜 이게 필요한가
 *
 * 0단계 이전에는 AI 를 **느낌으로** 고웠다. "이거 좀 느린 것 같은데", "리서처가 자꾸 멈추는데".
 * 두 느낌은 전혀 다른 원인을 가리킨다 — 느린 모델은 **더 작은 모델로** 고쳐야 하고, 429 로
 * 막히는 것은 **모델을 바꿔도** 안 나아진다(무료 티어 한도라 슬러그와 무관하다). 지표를
 * 없으면 이 둘을 구분하지 못한다.
 *
 * 읽기 순화는 이미 같은 자리가 있다(`purify-stats.ts`). 여기는 그 형식을 **다른 다섯 도구로
 * 확장**한 것이고, 형태를 맞춰 뒀다 — 두 장부의 이름을 다르게 만들면 사람이 합쳐 읽지 않는다.
 *
 * ## 무엇을 세고 무엇을 세지 않는가
 *
 * - `calls` — 모델을 실제로 부른 횟수. **재시도로 두 번 부르면 2 이다** — 이것이
 *   `retried` 를 따로 두는 이유다(폴백이 먹히면 calls 가 늘고, 한도는 늘지 않는다).
 * - `outcomes` — ok / refused / failed. **`refused` 는 `failed` 와 다른 값**이다 — 답이 온
 *   것이지 못 한 것이 아니다. 한 값으로 합치면 "모델을 바꾸자" 와 "다시 시도하자" 가 같아진다.
 * - `byModel` — 모델별 횟수. **이 표의 핵심이다.** 모델을 바꿨을 때 무엇이 좋아졌는지를
 *   여기서 읽는다. 실측 근거(벤치)와 실사용 근거(여기)는 다른 질문에 답한다.
 * - `latency` — 평균과 **초과한 비율**. 평균만으로는 "대부분 3초인데 1% 가 60초" 가 안 보인다.
 *   그 1% 가 화면에서 떠나게 만든다. `slow` 은 `OPENROUTER_TIMEOUT_MS` 의 절반을 넘긴
 *   비율이다 — 반을 기준선으로 삼은 건 **사용자가 "느린"고 느끼기 시작하는 지점**이 timeout
 *   이 아니라 그 이전이기 때문이다.
 *
 * **토큰 수는 세지 않는다.** 무료 라우터에서는 비용이 없고, usage 를 올리려면 SDK 를 한 겹 더
 * 밟아야 하는데 그 값으로 지금 무엇이 달라지지 않는다.
 */

export type AiCallOutcome = "ok" | "refused" | "failed";

export type AiCallStats = {
  day: string;
  calls: number;
  outcomes: Record<AiCallOutcome, number>;
  /** 모델별 횟수. 가장 많이 쓰인 것부터. */
  byModel: Array<{ model: string; calls: number; failed: number }>;
  /** 폴백으로 한 번 더 시도한 횟수. */
  retried: number;
  avgLatencyMs: number | null;
  /** timeout 절반을 넘긴 호출의 비율(0~1). */
  slow: number;
};

/** 이 시간이 걸리면 사람이 화면 앞에서 기다리기 시작한다. */
function slowThresholdMs(): number {
  return Math.round(Number(process.env.OPENROUTER_TIMEOUT_MS ?? 60_000) / 2);
}

function seoulDay(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(at);
}

/** 하루치 지표를 낸다. 팀 단위 — 한도가 팀 단위이므로 지표도 팀 단위로 맞춘다. */
export async function aiCallStats(teamId: string, at = Date.now()): Promise<AiCallStats> {
  const day = seoulDay(at);
  const rows = await db.aiCall.findMany({
    where: { teamId, day },
    select: { model: true, outcome: true, latencyMs: true, retried: true },
  });

  const outcomes: Record<AiCallOutcome, number> = { ok: 0, refused: 0, failed: 0 };
  const perModel = new Map<string, { calls: number; failed: number }>();
  let latencyTotal = 0;
  let slow = 0;
  let retried = 0;

  for (const row of rows) {
    // 모르는 값이 들어올 수 있다(모델이 새 값을 만들었다가 코드가 못 따라간 경우). **없는
    // 값은 실패로 친다** — 모르는 상태를 성공으로 보면 지표가 거짓말을 한다.
    const outcome: AiCallOutcome =
      row.outcome === "ok" || row.outcome === "refused" || row.outcome === "failed" ? row.outcome : "failed";
    outcomes[outcome] += 1;

    const seen = perModel.get(row.model) ?? { calls: 0, failed: 0 };
    seen.calls += 1;
    if (outcome === "failed") seen.failed += 1;
    perModel.set(row.model, seen);

    latencyTotal += row.latencyMs;
    if (row.latencyMs > slowThresholdMs()) slow += 1;
    if (row.retried) retried += 1;
  }

  return {
    day,
    calls: rows.length,
    outcomes,
    byModel: [...perModel.entries()]
      .map(([model, v]) => ({ model, calls: v.calls, failed: v.failed }))
      .sort((a, b) => b.calls - a.calls),
    retried,
    avgLatencyMs: rows.length > 0 ? Math.round(latencyTotal / rows.length) : null,
    slow: rows.length > 0 ? slow / rows.length : 0,
  };
}

/**
 * 보관 기간이 지난 계측을 지운다. 예약 작업이 부른다.
 *
 * `AiUsage` 와 **같은 기간·같은 기준**(`AI_POLICY.retentionDays`)을 쓴다. 두 장부의 보관
 * 기간이 다르면 하나는 "N일 뒤 지워집니다" 라고 말하고 다른 하나는 무한히 남게 되어,
 * **약속이 어느 쪽인지 모르게 된다.** 한 장부의 기간을 다른 데서 읽지 않는다 — 여기가
 * `AiUsage` 의 숫자를 직접 import 한다.
 *
 * 지우지 않으면 표가 자꾸 커진다. `AiCall` 은 한 줄이 작지만 **하루 수백 번** 쌓이고,
 * 계측이 없는 것만큼 조용히 쌓이는 것이 문제다.
 */
export async function sweepAiCalls(): Promise<number> {
  const cutoff = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(Date.now() - AI_POLICY.retentionDays * 24 * 60 * 60 * 1000),
  );
  const { count } = await db.aiCall.deleteMany({ where: { day: { lt: cutoff } } });
  return count;
}

/** 사람이 읽을 한 줄. 예약 작업 로그와 curl 응답에 들어간다(`purify-stats` 와 같은 자리). */export function describeAiCalls(stats: AiCallStats): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return [
    `[AI ${stats.day}] 호출 ${stats.calls}`,
    `· 성공 ${stats.outcomes.ok}`,
    `· 거절 ${stats.outcomes.refused}`,
    `· 실패 ${stats.outcomes.failed}`,
    stats.retried > 0 ? `· 폴백 ${stats.retried}` : "",
    stats.avgLatencyMs === null ? "" : `· 평균 ${(stats.avgLatencyMs / 1000).toFixed(1)}초`,
    stats.calls > 0 ? `· 느림 ${pct(stats.slow)}` : "",
    stats.byModel.length
      ? `· 모델 ${stats.byModel.map((m) => `${m.model}(${m.calls}${m.failed ? `/실패${m.failed}` : ""})`).join(" ")}`
      : "",
  ]
    .filter(Boolean)
    .join("");
}


export type TeamAiWeeklySummary = {
  days: number;
  totalCalls: number;
  successRate: number;
  refusalRate: number;
  failureRate: number;
  avgLatencyMs: number | null;
  slowRate: number;
  fallbackCount: number;
  fallbackRate: number;
  /** 이상 상태 경고 메시지 목록 (성공률 저조, 폴백 급증, 지연 심화 등) */
  warnings: string[];
};

/**
 * 최근 N일(기본 7일) 동안의 팀 전체 AI 호출 요약 지표.
 * 개인 정보(누가 무엇을 요청했는지)는 일체 포함하지 않고 집계 수치만 제공한다.
 */
export async function teamAiWeeklySummary(teamId: string, days = 7): Promise<TeamAiWeeklySummary> {
  const cutoffDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
  const cutoffDay = seoulDay(cutoffDate.getTime());

  const rows = await db.aiCall.findMany({
    where: {
      teamId,
      day: { gte: cutoffDay },
    },
    select: { outcome: true, latencyMs: true, retried: true },
  });

  const total = rows.length;
  if (total === 0) {
    return {
      days,
      totalCalls: 0,
      successRate: 1,
      refusalRate: 0,
      failureRate: 0,
      avgLatencyMs: null,
      slowRate: 0,
      fallbackCount: 0,
      fallbackRate: 0,
      warnings: [],
    };
  }

  let ok = 0;
  let refused = 0;
  let failed = 0;
  let retried = 0;
  let latencyTotal = 0;
  let slow = 0;
  const slowThreshold = slowThresholdMs();

  for (const row of rows) {
    if (row.outcome === "ok") ok += 1;
    else if (row.outcome === "refused") refused += 1;
    else failed += 1;

    if (row.retried) retried += 1;
    latencyTotal += row.latencyMs;
    if (row.latencyMs > slowThreshold) slow += 1;
  }

  const successRate = ok / total;
  const refusalRate = refused / total;
  const failureRate = failed / total;
  const slowRate = slow / total;
  const fallbackRate = retried / total;
  const avgLatencyMs = Math.round(latencyTotal / total);

  const warnings: string[] = [];
  if (total >= 5) {
    if (failureRate >= 0.2) {
      warnings.push(`최근 AI 호출 실패율이 ${(failureRate * 100).toFixed(0)}%로 높습니다.`);
    }
    if (fallbackRate >= 0.3) {
      warnings.push(`폴백(재시도) 비율이 ${(fallbackRate * 100).toFixed(0)}%로 급증했습니다.`);
    }
    if (slowRate >= 0.3) {
      warnings.push("AI 응답 지연 빈도가 평소보다 높습니다.");
    }
  }

  return {
    days,
    totalCalls: total,
    successRate,
    refusalRate,
    failureRate,
    avgLatencyMs,
    slowRate,
    fallbackCount: retried,
    fallbackRate,
    warnings,
  };
}
