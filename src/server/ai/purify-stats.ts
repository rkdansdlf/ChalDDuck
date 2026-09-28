import "server-only";

import { db } from "@/server/db";
import {
  cushionBucketOf,
  purificationAiShare,
  purificationCoverage,
  type CushionBucket,
  type CushionReason,
  type CushionStatus,
} from "@/lib/read-cushion";

/**
 * 읽기 순화의 **하루 지표**.
 *
 * 이 기능은 느낌으로 튜닝하면 안 된다. 실측에서 이미 "협조적인 말은 되고 싸운 말은 안 된다" 가
 * 나왔고, 그 판단을 뒤집는 근거는 **숫자**다 — "free: usable 41% / model A: usable 91%,
 * 비용 2.2배" 처럼 비교할 수 있어야 유료 모델 도입을 결정할 수 있다.
 *
 * ## 무엇을 세고 무엇을 세지 않는가
 *
 * - `rows` — 순화 대상 말의 개수(= 상태가 저장된 행). **후보 수의 대용**이다.
 * - `buckets` — 각 행이 어떤 결말인지(순화됨·가림·거절·버림·실패·처리 중).
 * - `coverage` — 읽는 사람이 **끊김 없이** 읽을 수 있는 비율(순화 + 가림).
 * - `aiShare` — 그중 **AI 가 실제로 한** 비율. 커버리지가 높아도 이 값이 낮으면
 *   규칙 가림이 기능 전체를 버티고 있는 것이다(실측 16말에서 그렇게 나왔다).
 * - `avgLatencyMs` — 호출이 얼마나 걸렸나. **행 기준 평균**이므로 큰 묶음에 끌려간다.
 *   호출 수(`calls`)와 함께 볼 때만 뜻가 있다.
 * - `calls` — 오늘 실제로 AI 를 부른 횟수(`AiUsage`).
 *
 * **토큰 수는 세지 않는다.** 무료 라우터에서는 비용이 없으므로 비용 대비 판단에 그대로 쓰이지
 * 않고, `model.ts` 에 usage 를 올리기 위해 한 단계를 더 밟는 것은 지금 값보다 비싸다.
 */
export type PurificationStats = {
  day: string;
  rows: number;
  buckets: Record<CushionBucket, number>;
  /** 이유별 개수 — 어느 검사나 어느 모델 탓인지. */
  reasons: Record<string, number>;
  /** AI 가 실제로 한 비율. */
  aiShare: number;
  /** 읽는 사람이 끊김 없이 읽을 수 있는 비율(순화 + 가림). */
  coverage: number;
  calls: number;
  avgLatencyMs: number | null;
  /** 단계별 개수 — 약하게 읽는 사람이 몇 명인지. */
  modes: Record<string, number>;
};

function seoulDay(at: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(at);
}

export async function purificationStats(teamId: string, at = Date.now()): Promise<PurificationStats> {
  const day = seoulDay(at);
  const from = new Date(`${day}T00:00:00+09:00`);

  const [rows, usage, settings] = await Promise.all([
    db.messageCushion.findMany({
      where: { createdAt: { gte: from }, message: { teamId } },
      select: { status: true, reason: true, source: true, latencyMs: true },
    }),
    db.aiUsage.count({ where: { teamId, tool: "read-cushion", day } }),
    db.readCushion.groupBy({
      by: ["mode"],
      where: { member: { teamId } },
      _count: { _all: true },
    }),
  ]);

  const buckets = { done: 0, masked: 0, refused: 0, rejected: 0, failed: 0, pending: 0 } as Record<
    CushionBucket,
    number
  >;
  const reasons: Record<string, number> = {};
  let latencyTotal = 0;
  let latencyCount = 0;

  for (const row of rows) {
    // 저장된 값은 `String` 이다 — 모르는 상태도 있으므로 **검증된 종류로 좁힌 뒤** 넣는다.
    // 모르는 값은 `cushionBucketOf` 가 "실패" 로 본다(아래가 그렇게 적혀 있다).
    buckets[cushionBucketOf({ ...row, status: row.status as CushionStatus, reason: row.reason as CushionReason | null })] += 1;
    if (row.reason) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
    if (typeof row.latencyMs === "number") {
      latencyTotal += row.latencyMs;
      latencyCount += 1;
    }
  }

  return {
    day,
    rows: rows.length,
    buckets,
    reasons,
    aiShare: purificationAiShare(buckets),
    coverage: purificationCoverage(buckets),
    calls: usage,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencyTotal / latencyCount) : null,
    modes: Object.fromEntries(settings.map((row) => [row.mode, row._count._all])),
  };
}

/** 사람이 읽을 한 줄. 예약 작업 로그와 curl 응답에 들어간다. */
export function describePurification(stats: PurificationStats): string {
  return [
    `[순화 ${stats.day}] 말 ${stats.rows} · 커버리지 ${Math.round(stats.coverage * 100)}% · AI 비율 ${Math.round(
      stats.aiShare * 100,
    )}% · 거절 ${stats.buckets.refused} · 버림 ${stats.buckets.rejected} · 실패 ${stats.buckets.failed}`,
    stats.avgLatencyMs === null ? "" : ` · 평균 ${(stats.avgLatencyMs / 1000).toFixed(1)}초`,
    Object.keys(stats.reasons).length ? ` · 사유 ${JSON.stringify(stats.reasons)}` : "",
  ]
    .filter(Boolean)
    .join("");
}
