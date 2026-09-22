"use server";

import { SENTENCE_SAMPLE_INPUT } from "@/data/catalog";
import type { AiResult, ClerkDraft, PresentDraft, ResearchResult } from "@/lib/types";
import { isAiConfigured } from "@/server/ai/model";
import { consumeAiQuota, type AiToolKey } from "@/server/ai/limit";
import * as ai from "@/server/ai/tools";
import { requireSessionMember } from "@/server/session";

/**
 * AI 도구 서버 액션 — 화면이 부르는 자리.
 *
 * 내용은 `server/ai/tools.ts` 에 있고 여기는 **문 세 개**만 본다: 팀원인가, 오늘 쓸 몫이
 * 남았는가, 그리고 실패를 어떻게 돌려줄 것인가. 액션으로 둔 이유가 그것이다 — API 키는
 * 서버에만 있어야 하고, 화면에서 직접 모델을 부르면 키가 브라우저로 나간다.
 *
 * 키(`OPENROUTER_KEY`)가 없으면 도구는 미리 적어 둔 샘플을 돌려준다.
 * 화면은 `getAiStatus()` 로 어느 쪽인지 알고 사용자에게 그대로 알린다.
 */

/**
 * 도구 하나를 부르는 공통 틀.
 *
 * **실패를 던지지 않고 돌려준다.** 운영 빌드의 Next 는 서버에서 던진 오류의 문구를 지우고
 * `digest` 만 보낸다 — `throw new Error("오늘 한도를 다 썼습니다")` 는 사용자 화면에
 * 절대 닿지 않는다. 돌려주는 값은 데이터라서 그대로 도착한다.
 *
 * 모델 쪽 실패 문구는 그대로 내보내지 않는다(SDK 의 영어 오류·내부 주소가 섞인다).
 * 대신 서버 로그에 남기고, 개발 중일 때만 원문을 함께 보낸다 — 고칠 사람은 그 문구가 필요하다.
 */
async function runTool<T>(tool: AiToolKey, call: () => Promise<T>): Promise<AiResult<T>> {
  const me = await requireSessionMember();

  // 키가 없으면 샘플을 돌려주는 길이다 — 부르지 않은 호출을 한도에서 깎지 않는다.
  if (isAiConfigured()) {
    const quota = await consumeAiQuota(me, tool);
    if (!quota.ok) return quota;
  }

  try {
    return { ok: true, value: await call() };
  } catch (cause: unknown) {
    console.error(`[ai:${tool}]`, cause);

    const detail =
      process.env.NODE_ENV !== "production" && cause instanceof Error ? ` (${cause.message})` : "";
    return { ok: false, message: `AI 응답을 받지 못했습니다.${detail}` };
  }
}

/** 말투만 바꾼다 — 요구하는 내용(마감·필요한 것)은 그대로 둔다. */
export async function rewriteWithCushion(text: string, tone: string): Promise<AiResult<string>> {
  return runTool("cushion", () => ai.rewriteWithCushion(text, tone));
}

/** 회의 메모에서 요약과 할 일 **후보**를 뽑는다. 그대로 반영되지는 않는다. */
export async function summarizeMeeting(raw: string): Promise<AiResult<ClerkDraft>> {
  return runTool("clerk", () => ai.summarizeMeeting(raw));
}

/** 출처가 없는 결과는 돌려주지 않는다. 적합도 점수는 만들지 않는다. */
export async function searchResearch(query: string): Promise<AiResult<ResearchResult[]>> {
  return runTool("research", () => ai.searchResearch(query));
}

/** 표현만 다듬고 내용을 새로 지어내지 않는다. */
export async function refineScript(raw: string): Promise<AiResult<PresentDraft>> {
  return runTool("present", () => ai.refineScript(raw));
}

export async function convertSentence(text: string, mode: string): Promise<AiResult<string>> {
  return runTool("sentence", () => ai.convertSentence(text, mode));
}

/** 모델을 부르지 않는다 — 미리 적어 둔 예시 문장이라 한도와 무관하다. */
export async function getSentenceSample(mode: string): Promise<string> {
  await requireSessionMember();
  return SENTENCE_SAMPLE_INPUT[mode] ?? "";
}
