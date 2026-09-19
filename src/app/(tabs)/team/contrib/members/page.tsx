import { getDemoTeam, getRoster, getTeamCheck } from "@/data/api";
import { ContribTeamScreen } from "@/features/contrib/contrib-team-screen";

/** 17 기여도 · 팀원 확인. */
export default async function ContribTeamPage() {
  const team = await getDemoTeam();
  const [records, roster] = await Promise.all([getTeamCheck(team.id), getRoster(team.id)]);
  return <ContribTeamScreen records={records} roster={roster} />;
}
