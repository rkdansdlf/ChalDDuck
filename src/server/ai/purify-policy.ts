import { createHash } from "node:crypto";

import { db } from "@/server/db";
import { activeModelId } from "@/server/ai/model";
import { CUSHION_DEFAULT_MODE } from "@/data/catalog";
import { levelOf, toneOf, PROMPT_VERSION, VALIDATOR_VERSION } from "@/lib/read-cushion";
import type { CushionLevelKey } from "@/lib/types";

/**
 * **읽기 도움 정책(Policy) — 읽기 도움 결과를 공유하는 열쇠.**
 *
 * 다듬은 말을 (말, 읽는 사람) 이 아니라 **(말, 이 지문)** 으로 저장한다. 그래서 팀원 5명이 방에서
 * 같이 읽어도 **같은 말을 모델에 한 번만** 부른다.
 *
 * 이 파일은 그 지문을 **만들고 읽는 두 곳**(쓰기: 읽기 도움 액션 · 읽기: 화면 조회)이 함께 쓴다.
 * 두 곳이 다르면 조회가 아무것도 못 찾거나, 남의 말을 다른 설정의 다듬은 말으로 그린다.
 */

/** 결과를 바꾸는 조건. */
export type PurifyPolicy = {
  /** 읽기 강도: LIGHT | NORMAL | STRONG */
  level: string;
  /** 읽을 말투: soft | asis | blob */
  tone: string;
  /** 이 결과를 만든 모델 */
  model: string;
  promptVersion: string;
  validatorVersion: string;
};

/**
 * **읽기 정책 지문.**
 *
 * 결과를 바꾸는 조건만 담는다. 필드 순서까지 고정해 해시를 만든다.
 *
 * ## 무엇을 넣지 않는가 — 이것이 이 구조의 전부다
 *
 * - **읽는 사람**을 넣지 않는다. 넣으면 팀원 수만큼 같은 말을 다시 만든다(AI 한도 1회씩).
 * - **팀 ID** 를 넣지 않는다. 원문이 같으면 결과도 같다. 동명이 다른 팀끼리 섞는 것이지만,
 *   더 공유할 수 있으므로 넣지 않는 편이 낫다.
 * - **원문**을 넣지 않는다. 원문은 다른 열(`sourceHash`)에 있고, 지문은 "조건" 만 나타낸다.
 *   그래야 조건이 같으면 결과를 재사용할 수 있다.
 *
 * 지문 규칙을 바꾸려면 맨 앞의 `v1` 을 함께 바꾼다 — 그러면 예전 지문의 행은 그대로 남고,
 * 아무도 그 지문을 다시 만들지 않는다(한 번에 다 사라지지 않음).
 */
export function purifyPolicyHash(policy: PurifyPolicy): string {
  return createHash("sha256")
    .update(
      [
        "v1",
        policy.level,
        policy.tone,
        policy.model,
        policy.promptVersion,
        policy.validatorVersion,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * **이 사람이 이 방에서 지금 읽는 설정**을 실제 표에서 읽어 지문으로 만든다.
 *
 * 조회가 읽기 경로마다 부르므로 **한 번의 `findUnique` 으로 끝나야 한다.** 다듬은 말과 설정을
 * 한 번에 같이 가져오는 조회가 필요하면 그렇게 하되, 지금은 `findUnique` 한 번이 가장 싸다.
 *
 * 사람이 없거나 로그인하지 않았으면 `enabled: false` — 화면은 그때 다듬은 말을 아예 그리지 않는다.
 */
export async function resolveReadPolicy(
  memberId: string | null,
  threadKey: string,
): Promise<{ enabled: boolean; policyHash: string }> {
  if (!memberId) return { enabled: false, policyHash: "" };
  const row = await db.readCushion.findUnique({
    where: { memberId_threadKey: { memberId, threadKey } },
    select: { enabled: true, mode: true, tone: true },
  });
  if (row && row.enabled === false) return { enabled: false, policyHash: "" };
  const level = levelOf({
    enabled: true,
    mode: (row?.mode ?? CUSHION_DEFAULT_MODE) as CushionLevelKey,
    tone: row?.tone ?? null,
  });
  return {
    enabled: true,
    policyHash: purifyPolicyHash({
      level,
      tone: toneOf({ tone: row?.tone ?? null }),
      model: activeModelId(),
      promptVersion: PROMPT_VERSION,
      validatorVersion: VALIDATOR_VERSION,
    }),
  };
}
