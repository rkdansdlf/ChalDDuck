"use server";

import { SENTENCE_SAMPLE_INPUT } from "@/data/catalog";
import type { AiResult, ClerkDraft, PresentDraft, ResearchResult } from "@/lib/types";
import { aiQuotaFor, aiUsageCsv, type AiQuota } from "@/server/ai/limit";
import { runTool } from "@/server/ai/run";
import * as ai from "@/server/ai/tools";
import { requireSessionMember } from "@/server/session";

/**
 * AI 도구 서버 액션 — 화면이 부르는 자리.
 *
 * 내용은 `server/ai/tools.ts` 에 있고, 호출 틀(한도·실패 처리)은 `server/ai/run.ts` 에
 * 있다 — **읽기 순화(19·31) 액션도 그 틀을 함께 쓴다.** 한도를 세고 실패를 돌려주는
 * 규칙이 두 곳에 있으면 어느 한쪽만 고쳐지는 일이 생긴다.
 * 여기서는 **문 세 개**만 본다: 팀원인가, 오늘 쓸 몫이 남았는가, 그리고 실패를 어떻게
 * 돌려줄 것인가. 액션으로 둔 이유가 그것이다 — API 키는 서버에만 있어야 하고, 화면에서
 * 직접 모델을 부르면 키가 브라우저로 나간다.
 *
 * 키(`OPENROUTER_KEY`)가 없으면 도구는 미리 적어 둔 샘플을 돌려준다.
 * 화면은 `getAiStatus()` 로 어느 쪽인지 알고 사용자에게 그대로 알린다.
 */

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

/**
 * 14 허브의 "AI 사용 내역 내려받기".
 *
 * 팀 전체의 내역이다 — 한도도 팀 단위로 세고, 수업에 낼 기록이라면 팀 것이어야 한다.
 * 한 사람 몫만 받을지는 기획안에 없다(허브의 `<Undecided>`).
 */
export async function exportAiUsage(): Promise<{ filename: string; csv: string }> {
  const me = await requireSessionMember();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  return { filename: `찰떡-AI-사용내역-${day}.csv`, csv: await aiUsageCsv(me.teamId) };
}

/**
 * 오늘 남은 횟수. **읽기만 한다 — 한도를 깎지 않는다.**
 *
 * 화면이 이걸 보고 경고한다. 예전에는 한도를 다 쓸 때까지 아무 말 없이 잘 되다가, 버튼을 눌렀을
 * 때 "다 썼습니다"가 떴다 — 사용자가 막혔다고 불 때까지 근본 원인을 알 수 없었다. 남은
 * 횟수를 미리 보여 주면 **"나 한 번만 더 시도해 보자" 를 할 수 없다**는 것을 알기 전에 알 수 있다.
 *
 * 읽기는 차감이 없으므로 화면 진입 시에 부를 수 있다. 모델도 부르지 않는다.
 */
export async function getAiQuota(): Promise<AiQuota> {
  const me = await requireSessionMember();
  return aiQuotaFor(me);
}

/** 모델을 부르지 않는다 — 미리 적어 둔 예시 문장이라 한도와 무관하다. */
export async function getSentenceSample(mode: string): Promise<string> {
  await requireSessionMember();
  return SENTENCE_SAMPLE_INPUT[mode] ?? "";
}
