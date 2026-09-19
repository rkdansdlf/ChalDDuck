"use server";

import { SENTENCE_SAMPLE_INPUT } from "@/data/catalog";
import type { ClerkDraft, PresentDraft, ResearchResult } from "@/lib/types";
import * as ai from "@/server/ai/tools";
import { requireSessionMember } from "@/server/session";

/**
 * AI 도구 서버 액션 — 화면이 부르는 자리.
 *
 * 내용은 `server/ai/tools.ts` 에 있고 여기는 **세션 확인만** 한다.
 * 액션으로 둔 이유가 그것이다 — API 키는 서버에만 있어야 하고, 화면에서 직접 모델을
 * 부르면 키가 브라우저로 나간다. 호출마다 비용이 드니 팀원인지도 먼저 본다.
 *
 * 키(`ANTHROPIC_API_KEY`)가 없으면 도구는 미리 적어 둔 샘플을 돌려준다.
 * 화면은 `getAiStatus()` 로 어느 쪽인지 알고 사용자에게 그대로 알린다.
 */

/** 말투만 바꾼다 — 요구하는 내용(마감·필요한 것)은 그대로 둔다. */
export async function rewriteWithCushion(text: string, tone: string): Promise<string> {
  await requireSessionMember();
  return ai.rewriteWithCushion(text, tone);
}

/** 회의 메모에서 요약과 할 일 **후보**를 뽑는다. 그대로 반영되지는 않는다. */
export async function summarizeMeeting(raw: string): Promise<ClerkDraft> {
  await requireSessionMember();
  return ai.summarizeMeeting(raw);
}

/** 출처가 없는 결과는 돌려주지 않는다. 적합도 점수는 만들지 않는다. */
export async function searchResearch(query: string): Promise<ResearchResult[]> {
  await requireSessionMember();
  return ai.searchResearch(query);
}

/** 표현만 다듬고 내용을 새로 지어내지 않는다. */
export async function refineScript(raw: string): Promise<PresentDraft> {
  await requireSessionMember();
  return ai.refineScript(raw);
}

export async function convertSentence(text: string, mode: string): Promise<string> {
  await requireSessionMember();
  return ai.convertSentence(text, mode);
}

export async function getSentenceSample(mode: string): Promise<string> {
  await requireSessionMember();
  return SENTENCE_SAMPLE_INPUT[mode] ?? "";
}
