import { getContribKinds, getCurrentTeam, getMyContrib, getTeamCheck } from "@/data/api";
import { ContribSelfScreen } from "@/features/contrib/contrib-self-screen";

/** 기여 기록 허브 */
export default async function ContribSelfPage() {
  const team = await getCurrentTeam();
  const [records, kinds, teamRecords] = await Promise.all([
    getMyContrib(team.id),
    getContribKinds(),
    getTeamCheck(team.id),
  ]);
  return <ContribSelfScreen records={records} kinds={kinds} teamRecords={teamRecords} />;
}
