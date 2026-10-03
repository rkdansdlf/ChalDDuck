import "server-only";

import type { AiResult } from "@/lib/types";
import { withAiCaller } from "@/server/ai/call-context";
import { isAiConfigured } from "@/server/ai/model";
import { recordAiUsage, refundAiUsage, type AiToolKey } from "@/server/ai/limit";
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
 * (`ai-limit.ts` 가 그 약속을 설명한다). 순화 읽기(`MessagePurification`)는 예외가 아니라
 * **사용자에게 보이는 읽기 결과**다 — 원문은 그대로 두고 그 화면에 보이는 문장만 남긴다.
 *
 * 계측(`AiCall`)은 예외다 — **글은 남기지 않고** 도구·모델·지연·결과만 남긴다
 * (`call-stats.ts` 가 그 약속을 적어 둔다). 여기서 `withAiCaller` 로 감싸는 이유는 그
 * 기록의 주인이 여기서만 알려져서다 — 모델 층은 세션을 모른다.
 */
export async function runTool<T>(tool: AiToolKey, call: () => Promise<T>): Promise<AiResult<T>> {
  const me = await requireSessionMember();

  // 키가 없으면 예시를 돌려주는 길이다 — 부르지 않은 호출을 기록하지 않는다.
  const live = isAiConfigured();

  /**
   * 방금 깎은 몫의 행 id. **키가 없으면 비어 있다** — 지울 것이 없으므로 실패해도 되돌릴
   * 것도 없다. `undefined` 인 채로 `refundAiQuota` 를 부르면 아무 일도 일어나지 않으므로
   * 되돌림 여부도 한 번에 판단된다.
   */
  let usageId: string | undefined;

  if (live) {
    const quota = await recordAiUsage(me, tool);
    if (!quota.ok) return quota;
    usageId = quota.usageId;
  }

  try {
    // 키가 없으면 `call()` 은 모델에 닿지 못하고 예시로 돌아온다. 그 사실을 **어디서 판단할지**
    // 정하지 않고, 결과를 내보내는 이 자리에서 결정해 값에 붙인다. 예전에는 이게 없었고,
    // 각 화면이 `isAiConfigured()` 를 다시 보고 자기 방식으로 추측했다 — 그중 forgets한 곳에서
    // 예시가 "AI 결과"처럼 보였다.
    const value = await withAiCaller({ teamId: me.teamId, memberId: me.id }, call);
    return { ok: true, value, source: live ? ("ai" as const) : ("sample" as const) };
  } catch (cause: unknown) {
    console.error(`[ai:${tool}]`, cause);

    /**
     * **모델이 실패한 만큼 한도를 되돌린다.**
     *
     * 예전에는 한도를 깎고 시작만 하면 끝이었다 — 그래서 무료 라우터가 자주 실패할수록
     * 사용자는 **한 번도 결과를 못 받은 횟수**만큼 자기 몫을 잃었다. 이건 우리가 정한
     * 한도인데, 실패를 그 통행료로 받으면 한도가 재화의 대가가 된다.
     *
     * 되돌림은 **아무 답도 못 받았을 때만** 일어난다. 한도 초과(행을 만들지 않았다)와 모델
     * 거절(`throw` 가 아니라 돌려준 답)은 이 자리에 오지 않으므로, 안전 필터 거절이
     * 공짜로 반복되는 길은 열리지 않는다.
     */
    if (usageId) await refundAiUsage(me, usageId);

    const detail =
      process.env.NODE_ENV !== "production" && cause instanceof Error ? ` (${cause.message})` : "";
    return { ok: false, message: `AI 응답을 받지 못했습니다.${detail}` };
  }
}
