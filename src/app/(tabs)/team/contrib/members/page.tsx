import { getConfirmsPolicy, getCurrentTeam, getRoster, getTeamCheck } from "@/data/api";
import { ContribTeamScreen } from "@/features/contrib/contrib-team-screen";
import { isTeamLeader } from "@/server/contrib/team-check";

/**
 * 17 기여 기록 · 팀원 확인.
 *
 * 확정 기준(몇 명이 확인해야 하는가)을 팀이 정한다 — 팀장만 고를 수 있고, 고치면 팀의
 * 기록을 전부 다시 계산한다(`setConfirmsNeeded`).
 */
export default async function ContribTeamPage() {
  const team = await getCurrentTeam();
  const [records, roster, policy, leader] = await Promise.all([
    getTeamCheck(team.id),
    getRoster(team.id),
    getConfirmsPolicy(team.id),
    isTeamLeader(team.id),
  ]);
  return (
    <ContribTeamScreen records={records} roster={roster} policy={policy} isLeader={leader} />
  );
}
