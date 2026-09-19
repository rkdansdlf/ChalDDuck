"use server";

import {
  CLERK_SAMPLE_DRAFT,
  CUSHION_SAMPLE_OUTPUT,
  PRESENT_SAMPLE_DRAFT,
  RESEARCH_SAMPLE_RESULTS,
  SENTENCE_SAMPLE_INPUT,
  SENTENCE_SAMPLE_OUTPUT,
} from "@/data/catalog";
import { requireSessionMember } from "@/server/session";
import type { ClerkDraft, PresentDraft, ResearchResult } from "@/lib/types";

/**
 * AI 도구 서버 액션.
 *
 * ⚠️ **아직 모델에 연결되어 있지 않다.** 입력을 받긴 하지만 무시하고 미리 적어 둔 샘플을
 * 돌려준다. 화면이 그 사실을 감추지 않도록 허브 화면이 안내하고 있다.
 *
 * 모델을 붙일 때는 이 함수들의 본문만 실제 호출로 바꾸면 된다. 액션으로 둔 이유도 그것이다 —
 * API 키는 서버에만 있어야 하고, 화면에서 직접 모델을 부르면 키가 브라우저로 나간다.
 *
 * 팀원만 쓸 수 있어야 하므로 모두 세션을 먼저 확인한다(호출 비용이 드는 자리다).
 */

/** 말투만 바꾼다 — 요구하는 내용(마감·필요한 것)은 그대로 둔다. */
export async function rewriteWithCushion(_text: string, tone: string): Promise<string> {
  await requireSessionMember();
  return CUSHION_SAMPLE_OUTPUT[tone] ?? CUSHION_SAMPLE_OUTPUT.soft;
}

/** 회의 메모에서 요약과 할 일 **후보**를 뽑는다. 그대로 반영되지는 않는다. */
export async function summarizeMeeting(_raw: string): Promise<ClerkDraft> {
  await requireSessionMember();
  return CLERK_SAMPLE_DRAFT;
}

/** 출처가 없는 결과는 돌려주지 않는다. 적합도 점수는 만들지 않는다. */
export async function searchResearch(_query: string): Promise<ResearchResult[]> {
  await requireSessionMember();
  return RESEARCH_SAMPLE_RESULTS;
}

/** 표현만 다듬고 내용을 새로 지어내지 않는다. */
export async function refineScript(_raw: string): Promise<PresentDraft> {
  await requireSessionMember();
  return PRESENT_SAMPLE_DRAFT;
}

export async function convertSentence(_text: string, mode: string): Promise<string> {
  await requireSessionMember();
  return SENTENCE_SAMPLE_OUTPUT[mode] ?? "";
}

export async function getSentenceSample(mode: string): Promise<string> {
  await requireSessionMember();
  return SENTENCE_SAMPLE_INPUT[mode] ?? "";
}
