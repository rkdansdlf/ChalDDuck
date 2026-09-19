import { getContribKinds, getDemoTeam, getMyContrib } from "@/data/api";
import { ContribSelfScreen } from "@/features/contrib/contrib-self-screen";

/** 16 기여도 · 본인 확인. */
export default async function ContribSelfPage() {
  const team = await getDemoTeam();
  const [records, kinds] = await Promise.all([getMyContrib(team.id), getContribKinds()]);
  return <ContribSelfScreen records={records} kinds={kinds} />;
}
