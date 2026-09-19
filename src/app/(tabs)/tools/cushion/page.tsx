import { getAiStatus, getCushionSample, getCushionSampleOutput, getCushionTones } from "@/data/api";
import { CushionScreen } from "@/features/tools/cushion-screen";

/** 15 쿠션 번역기. 첫 화면은 예시 문장과 예시 결과다. */
export default async function CushionPage() {
  const tones = await getCushionTones();
  const initialTone = tones[0]?.key ?? "soft";
  const [sample, initialResult, ai] = await Promise.all([
    getCushionSample(),
    getCushionSampleOutput(initialTone),
    getAiStatus(),
  ]);

  return (
    <CushionScreen
      tones={tones}
      sample={sample}
      initialResult={initialResult}
      aiReady={ai.connected}
    />
  );
}
