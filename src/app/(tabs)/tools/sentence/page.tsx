import { convertSentence, getSentenceModes, getSentenceSample } from "@/data/api";
import { SentenceScreen } from "@/features/tools/sentence-screen";

/** 27 상황별 문장 변환. */
export default async function SentencePage() {
  const modes = await getSentenceModes();
  const initialMode = modes[0].key;
  const initialInput = await getSentenceSample(initialMode);
  const initialOutput = await convertSentence(initialInput, initialMode);

  return (
    <SentenceScreen
      modes={modes}
      initialMode={initialMode}
      initialInput={initialInput}
      initialOutput={initialOutput}
    />
  );
}
