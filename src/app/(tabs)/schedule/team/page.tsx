import { getCurrentTeam, getMeetingProposal, getScheduleOptions, getTeamTimetables } from "@/data/api";
import { TeamTimeScreen } from "@/features/schedule/team-time-screen";

/**
 * 일정 탭 — 팀 겹쳐보기.
 *
 * 올라온 제안이 있는지를 요청 시점에 따진다(`effectiveStage`) — 빌드 때 굳으면
 * 지나간 마감이 계속 "대기 중"으로 보인다.
 */
export const dynamic = "force-dynamic";

export default async function ScheduleTeamPage() {
  const team = await getCurrentTeam();
  const [{ days, hours, weeks, candidateDays }, members, proposal] = await Promise.all([
    getScheduleOptions(),
    getTeamTimetables(team.id),
    getMeetingProposal(team.id),
  ]);

  return (
    <TeamTimeScreen
      team={team}
      days={days}
      hours={hours}
      weeks={weeks}
      candidateDays={candidateDays}
      members={members}
      proposal={proposal}
    />
  );
}
