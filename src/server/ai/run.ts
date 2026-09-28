import "server-only";

import type { AiResult } from "@/lib/types";
import { isAiConfigured } from "@/server/ai/model";
import { consumeAiQuota, type AiToolKey } from "@/server/ai/limit";
import { requireSessionMember } from "@/server/session";

/**
 * 모델을 부르는 공통 틀.
 *
 * **실패를 던지지 않고 돌려준다.** 운영 빌드의 Next 는 서버에서 던진 오류의 문구를 지우고
 * `digest` 만 보낸다 — `throw new Error("오늘 한도를 다 썼습니다")` 는 사용자 화면에
 * 절대 닿지 않는다. 돌려주는 값은 데이터라서 그대로 도착한다.
 *
 * 모델 쪽 실패 문구는 그대로 내보내지 않는다(SDK 의 영어 오류·내부 주소가 섞인다).
 * 대신 서버 로그에 남기고, 개발 중일 때만 원문을 함께 보낸다 — 고칠 사람은 그 문구가 필요하다.
 *
 * 여기서 하지 **않는** 것: 저장. 무엇을 넣고 무엇을 돌려받았는지는 남지 않는다
 * (`ai-limit.ts` 가 그 약속을 설명한다). 순화 읽기(`MessageCushion`)는 예외가 아니라
 * **사용자에게 보이는 읽기 결과**다 — 원문은 그대로 두고 그 화면에 보이는 문장만 남긴다.
 */
export async function runTool<T>(tool: AiToolKey, call: () => Promise<T>): Promise<AiResult<T>> {
  const me = await requireSessionMember();

  // 키가 없으면 예시를 돌려주는 길이다 — 부르지 않은 호출을 한도에서 깎지 않는다.
  const live = isAiConfigured();
  if (live) {
    const quota = await consumeAiQuota(me, tool);
    if (!quota.ok) return quota;
  }

  try {
    // 키가 없으면 `call()` 은 모델에 닿지 못하고 예시로 돌아온다. 그 사실을 **어디서 판단할지**
    // 정하지 않고, 결과를 내보내는 이 자리에서 결정해 값에 붙인다. 예전에는 이게 없었고,
    // 각 화면이 `isAiConfigured()` 를 다시 보고 자기 방식으로 추측했다 — 그중 forgets한 곳에서
    // 예시가 "AI 결과"처럼 보였다.
    return { ok: true, value: await call(), source: live ? ("ai" as const) : ("sample" as const) };
  } catch (cause: unknown) {
    console.error(`[ai:${tool}]`, cause);

    const detail =
      process.env.NODE_ENV !== "production" && cause instanceof Error ? ` (${cause.message})` : "";
    return { ok: false, message: `AI 응답을 받지 못했습니다.${detail}` };
  }
}
