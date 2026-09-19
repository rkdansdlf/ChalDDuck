import { getAiStatus, getPresentSample, getPresentSampleDraft } from "@/data/api";
import { PresentScreen } from "@/features/tools/present-screen";

/** 26 발표 지원. 첫 화면은 예시 대본과 예시 결과다. */
export default async function PresentPage() {
  const [sample, draft, ai] = await Promise.all([
    getPresentSample(),
    getPresentSampleDraft(),
    getAiStatus(),
  ]);
  return <PresentScreen sample={sample} initialDraft={draft} aiReady={ai.connected} />;
}
