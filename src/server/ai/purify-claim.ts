import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/server/db";
import { CLAIM_TTL_MS, PROMPT_VERSION, VALIDATOR_VERSION } from "@/lib/read-cushion";

/**
 * 읽기 도움 결과 행을 **선점**한다 — "이 말은 내가 모델에 보낸다" 를 DB 에 적는 일.
 *
 * ## 왜 따로 있나
 *
 * 선점은 두 가지 일이다. 둘을 `createMany({ skipDuplicates })` 하나로 처리하던 때가 있었다.
 *
 * 1. **행이 없는 말** — 새로 만든다. 두 탭이 동시에 만들면 유일 인덱스가 한 줄만 남긴다.
 * 2. **행이 이미 있는 말**(실패 뒤 백오프가 지났거나, `PENDING` 선점이 만료됐다) — `createMany` 는
 *    **이미 있는 행을 건드리지 않는다.** `canRetry` 는 "다시 해도 된다" 고 하는데 새 `claimToken` 을
 *    못 받아서, 그 말은 영영 다시 시도되지 못했다.
 *
 * 2번은 **조건부 갱신**으로 한다. 읽은 상태(상태·토큰·시도 횟수)와 같을 때만 바꾸므로, 두 요청이
 * 같은 만료 행을 동시에 가져가려 해도 한쪽만 성공한다.
 */

/** 선점하려는 행이 어떤 설정으로 만들어지는가 — 지문을 만드는 조건과 같은 값이다. */
export type ClaimPolicy = {
  policyHash: string;
  level: string;
  tone: string;
  model: string;
};

/** 이미 있는 행에서 **선점 조건을 비교하는 데** 필요한 것만. */
export type StoredClaim = {
  status: string;
  claimToken: string | null;
  attemptCount: number;
};

/**
 * `rows` 중 **내가 선점한 말의 id** 를 돌려준다.
 *
 * 호출하기 전에 **실제로 모델에 보낼 말만** 넘겨야 한다(`packPurifyItems` 를 먼저). 여기서 선점한
 * 말은 곧 "이 요청이 책임지고 끝내는 말" 이다 — 보내지 않을 말을 선점하면 만료될 때까지 아무도
 * 손대지 못한다.
 *
 * @param stored 지금 DB 에 있는 행(없으면 키가 없다). 호출자가 `canRetry` 를 통과시킨 말들이다.
 */
export async function claimPurifyRows(input: {
  rows: Array<{ id: string; sourceHash: string }>;
  stored: Map<string, StoredClaim>;
  policy: ClaimPolicy;
  at: number;
}): Promise<{ claimToken: string; mine: string[] }> {
  const { rows, stored, policy, at } = input;
  const claimToken = randomUUID();
  if (rows.length === 0) return { claimToken, mine: [] };

  const shared = {
    level: policy.level,
    status: "PENDING",
    tone: policy.tone,
    model: policy.model,
    promptVersion: PROMPT_VERSION,
    validatorVersion: VALIDATOR_VERSION,
    claimToken,
    retryAfter: new Date(at + CLAIM_TTL_MS),
  };

  // 1) 행이 없는 말 — 만든다. 시도는 선점하는 순간 한 번으로 센다(모델을 부르기 직전이다).
  const fresh = rows.filter((row) => !stored.has(row.id));
  if (fresh.length > 0) {
    await db.messagePurification.createMany({
      data: fresh.map((row) => ({
        ...shared,
        messageId: row.id,
        policyHash: policy.policyHash,
        sourceHash: row.sourceHash,
        attemptCount: 1,
      })),
      skipDuplicates: true,
    });
  }

  // 2) 행이 있는 말 — 읽은 상태와 같을 때만 가져온다. 이전 결과(글·이유)는 비운다.
  for (const row of rows) {
    const before = stored.get(row.id);
    if (!before) continue;
    await db.messagePurification.updateMany({
      where: {
        messageId: row.id,
        policyHash: policy.policyHash,
        status: before.status,
        claimToken: before.claimToken,
        attemptCount: before.attemptCount,
      },
      data: {
        ...shared,
        sourceHash: row.sourceHash,
        text: null,
        source: null,
        reason: null,
        latencyMs: null,
        attemptCount: before.attemptCount + 1,
      },
    });
  }

  // 3) 누가 가져갔는지는 **토큰이 말한다.** 방금 만든 행도, 갱신한 행도 같은 식으로 확인한다.
  const claimed = await db.messagePurification.findMany({
    where: { messageId: { in: rows.map((row) => row.id) }, policyHash: policy.policyHash, claimToken },
    select: { messageId: true },
  });
  const won = new Set(claimed.map((row) => row.messageId));
  return { claimToken, mine: rows.map((row) => row.id).filter((id) => won.has(id)) };
}
