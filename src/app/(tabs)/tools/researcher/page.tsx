import { getResearchSampleQuery, searchResearch } from "@/data/api";
import { ResearcherScreen } from "@/features/tools/researcher-screen";

/** 25 AI 리서처. */
export default async function ResearcherPage() {
  const sampleQuery = await getResearchSampleQuery();
  const results = await searchResearch(sampleQuery);
  return <ResearcherScreen sampleQuery={sampleQuery} initialResults={results} />;
}
