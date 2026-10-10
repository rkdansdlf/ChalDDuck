import { getTeamSaju } from "@/data/api";
import { TeamSajuScreen } from "@/features/saju/team-saju-screen";

/**
 * 우리 팀 사주 — 팀 오행 분포와 1:1 케미.
 *
 * 내 등록 여부에 따라 보이는 것이 달라지므로 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function TeamSajuPage() {
  return <TeamSajuScreen data={await getTeamSaju()} />;
}
