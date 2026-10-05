import { getAiStatus, getResearchSampleQuery, getResearchSampleResults, getTeamToolContext, getCurrentTeam } from "@/data/api";
import { ResearcherScreen } from "@/features/tools/researcher-screen";
import { researchQuerySuggestions, type QuerySuggestion } from "@/features/tools/research-query";

/**
 * 25 AI 리서처.
 *
 * 첫 화면은 예시 결과다 — 아직 아무것도 물어보지 않았는데 검색이 나가면 안 된다.
 *
 * ⚠️ **두 가지 진입이 있다** — 둘 다 살아야 한다.
 * - `?q=` 로 온 **검색어**(main 이 추가). 채팅·브리핑에서 "이 자료 찾아줘" 로 넘어온 길이다.
 * - **검색어 후보 칩**(2단계-c). 팀 문맥에서 뽑는다.
 *
 * 후보를 검색어 칸에 **자동으로 넣지 않는다** — 링크로 넘어온 `?q=` 만 칸에 들어가고,
 * 칩은 **누가 눌러야** 들어간다. 리서처 결과는 그대로 주소로 쓰이므로 "뭘 넣었는가" 가
 * 결과의 근거인데, 그것을 프로그램이 정하면 그 근거가 사라진다.
 */
export default async function ResearcherPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const initialQ = sp?.q?.trim();

  const team = await getCurrentTeam();
  const [sampleQuery, results, ai] = await Promise.all([
    getResearchSampleQuery(),
    getResearchSampleResults(),
    getAiStatus(),
  ]);

  /**
   * **검색어 후보**를 팀 문맥에서 뽑는다(2단계-c).
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
      sampleQuery={initialQ || sampleQuery}
      initialResults={results}
      aiReady={ai.connected}
      suggestions={suggestions}
    />
  );
}
