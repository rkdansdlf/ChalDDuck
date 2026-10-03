"use server";

import { SENTENCE_SAMPLE_INPUT } from "@/data/catalog";
import { getCurrentTeam, getTeamToolContext } from "@/data/api";
import type { AiResult, ClerkDraft, PresentDraft, ResearchResult } from "@/lib/types";
import { aiUsageCsv, aiUsageToday, type AiUsageToday } from "@/server/ai/limit";
import { teamAiWeeklySummary, type TeamAiWeeklySummary } from "@/server/ai/call-stats";
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
 *
 * ## 15 쿠션 번역기 · 27 문장 변환은 **여기에 없다**
 *
 * 그 둘은 예전에 여기서 불렀고, 이제는 `/api/ai/stream` 이 조각으로 보낸다
 * (6번 — 사람이 기다리는 시간을 줄이는 것이 목적). **액션을 남겨 둔 채 화면을 옮기면
 * 아무도 부르지 않는 모델 호출단이 하나 더 생긴다** — 돈이 드는 죽은 코드라서 지웠다.
 * 되돌리려면 같은 `runTool` 을 쓰는 액션 하나면 충분하고(한도·환불·출처가 그대로다),
 * 조각이 필요 없을 때 그 길이 된다.
 */

/**
 * 회의 메모에서 요약과 할 일 **후보**를 뽑는다. 그대로 반영되지는 않는다.
 *
 * ## 팀 문맥을 여기서 붙이는 이유
 *
 * **세션이 있는 이 자리**가 팀과 팀원을 함께 아는 유일한 곳이다. 화면이 조합해서 넘기면
 * 도구마다 다른 명단이 들어가고 **AI 가 본 팀이 사람마다 달라진다.**
 *
 * 문맥은 **담당자 매칭 재료**로도 쓰인다 — 모델이 적은 이름은 그대로 믿지 않고
 * `lib/tool-assignee.ts` 가 팀원 명단과 다시 대조한다. 그래서 "AI 가 유나 라고 적었다" 와
 * "우리 팀에 최유나 가 있다" 가 이어지면 담당자가 되고, 없으면 `null` 이 된다.
 *
 * 문맥 조회가 실패해도 **서기는 계속 돌아간다** — 회의 메모에서 뽑는 일은 팀 문맥과
 * 별개이기 때문이다. 조회가 죽은 걸로 "AI 가 고장났다" 고 말하면 사실이 다르다.
 */
export async function summarizeMeeting(raw: string): Promise<AiResult<ClerkDraft>> {
  const team = await getCurrentTeam();

  return runTool("clerk", async () => {
    let context;
    try {
      context = await getTeamToolContext(team.id);
    } catch (cause: unknown) {
      // **문맥 없이도 답한다.** 명단이 없으면 매칭을 시도하지 않을 뿐이다.
      console.error("[ai:clerk] 팀 문맥을 읽지 못했습니다. 문맥 없이 진행합니다:", cause);
    }
    return ai.summarizeMeeting(raw, undefined, context);
  });
}

/** 출처가 없는 결과는 돌려주지 않는다. 적합도 점수는 만들지 않는다. */
export async function searchResearch(query: string): Promise<AiResult<ResearchResult[]>> {
  return runTool("research", () => ai.searchResearch(query));
}

/** 표현만 다듬고 내용을 새로 지어내지 않는다. */
export async function refineScript(raw: string): Promise<AiResult<PresentDraft>> {
  return runTool("present", () => ai.refineScript(raw));
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
export async function getAiUsageToday(): Promise<AiUsageToday> {
  const me = await requireSessionMember();
  return aiUsageToday(me);
}

/** 모델을 부르지 않는다 — 미리 적어 둔 예시 문장이라 한도와 무관하다. */
export async function getSentenceSample(mode: string): Promise<string> {
  await requireSessionMember();
  return SENTENCE_SAMPLE_INPUT[mode] ?? "";
}

/** 팀 단위 최근 7일 AI 도구 운영 상태 요약. 개인별 호출 내용은 노출하지 않는다. */
export async function getTeamAiSummary(): Promise<TeamAiWeeklySummary> {
  const me = await requireSessionMember();
  return teamAiWeeklySummary(me.teamId, 7);
}
