import { getAiStatus, getResearchSampleQuery, getResearchSampleResults } from "@/data/api";
import { ResearcherScreen } from "@/features/tools/researcher-screen";

/**
 * 25 AI 리서처.
 *
 * 첫 화면은 예시 결과다 — 아직 아무것도 물어보지 않았는데 검색이 나가면 안 된다.
 */
export default async function ResearcherPage() {
  const [sampleQuery, results, ai] = await Promise.all([
    getResearchSampleQuery(),
    getResearchSampleResults(),
    getAiStatus(),
  ]);
  return (
    <ResearcherScreen sampleQuery={sampleQuery} initialResults={results} aiReady={ai.connected} />
  );
}
