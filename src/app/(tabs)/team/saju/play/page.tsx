import { getBalanceResults, getTeamSaju } from "@/data/api";
import { SajuPlayScreen } from "@/features/saju/play-screen";
import { todayInSeoul } from "@/features/schedule/week";

/**
 * 사주 놀이 — 오늘의 궁합 · 사주 맞히기 · 밸런스 게임.
 *
 * 내 등록 여부와 내 표에 따라 보이는 것이 달라지므로 요청마다 렌더한다. **"오늘"은 서버가 정한다** —
 * 오늘의 짝과 맞히기 문제 순서가 날짜로 정해지므로, 기기 시계로 재면 사람마다 다른 날을 본다.
 */
export const dynamic = "force-dynamic";

export default async function SajuPlayPage() {
  const [saju, balance] = await Promise.all([getTeamSaju(), getBalanceResults()]);
  return <SajuPlayScreen saju={saju} balance={balance} today={todayInSeoul()} />;
}
