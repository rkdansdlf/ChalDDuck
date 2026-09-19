import {
  getAiStatus,
  getSentenceModes,
  getSentenceSample,
  getSentenceSampleOutput,
} from "@/data/api";
import { SentenceScreen } from "@/features/tools/sentence-screen";

/** 27 상황별 문장 변환. 첫 화면은 예시 입력과 예시 결과다. */
export default async function SentencePage() {
  const modes = await getSentenceModes();
  const initialMode = modes[0].key;
  const [initialInput, initialOutput, ai] = await Promise.all([
    getSentenceSample(initialMode),
    getSentenceSampleOutput(initialMode),
    getAiStatus(),
  ]);

  return (
    <SentenceScreen
      modes={modes}
      initialMode={initialMode}
      initialInput={initialInput}
      initialOutput={initialOutput}
      aiReady={ai.connected}
    />
  );
}
