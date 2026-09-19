import { getPresentSample, refineScript } from "@/data/api";
import { PresentScreen } from "@/features/tools/present-screen";

/** 26 발표 지원. */
export default async function PresentPage() {
  const sample = await getPresentSample();
  const draft = await refineScript(sample);
  return <PresentScreen sample={sample} initialDraft={draft} />;
}
