import { getAiStatus, getResearchSampleQuery, getResearchSampleResults, getTeamToolContext } from "@/data/api";
import { getCurrentTeam } from "@/data/api";
import { ResearcherScreen } from "@/features/tools/researcher-screen";
import { researchQuerySuggestions, type QuerySuggestion } from "@/features/tools/research-query";

/**
 * 25 AI 리서처.
 *
 * 첫 화면은 예시 결과다 — 아직 아무것도 물어보지 않았는데 검색이 나가면 안 된다.
 */
export default async function ResearcherPage() {
  const team = await getCurrentTeam();
  const [sampleQuery, results, ai] = await Promise.all([
    getResearchSampleQuery(),
    getResearchSampleResults(),
    getAiStatus(),
  ]);

  /**
   * **검색어 초안**을 팀 문맥에서 뽑는다(2단계-c).
   *
   * 입력을 **덮어쓰지 않는다** — 후보만 넘겨서 화면이 칩으로 보여 준다. 리서처 결과는
   * 그대로 주소로 쓰이므로 "왜 이 결과가 나왔지" 를 물으면 **뭘 넣었는지가 답**이고,
   * 그것을 프로그램이 대신 정하면 답이 사라진다.
   *
   * ⚠️ **조회가 실패해도 화면은 열린다.** 검색어는 부가 기능인데 그 조회 때문에 리서처
   * 자체가 안 되면 "AI 가 고장났다" 고 오해하게 된다. 후보만 비운다.
   */
  let suggestions: QuerySuggestion[] = [];
  try {
    suggestions = researchQuerySuggestions(await getTeamToolContext(team.id));
  } catch (cause: unknown) {
    console.error("[research] 검색어 초안을 만들지 못했습니다:", cause);
  }

  return (
    <ResearcherScreen
      sampleQuery={sampleQuery}
      initialResults={results}
      aiReady={ai.connected}
      suggestions={suggestions}
    />
  );
}
