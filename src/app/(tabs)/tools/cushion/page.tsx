import { getCushionSample, getCushionTones } from "@/data/api";
import { CushionScreen } from "@/features/tools/cushion-screen";

/** 15 쿠션 번역기. */
export default async function CushionPage() {
  const [tones, sample] = await Promise.all([getCushionTones(), getCushionSample()]);
  return <CushionScreen tones={tones} sample={sample} />;
}
