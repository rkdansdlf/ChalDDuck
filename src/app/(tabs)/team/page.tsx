import {
  getCurrentTeam,
  getRandomTools,
  getJoinRequests,
  getRejoinRequests,
  getRoleNegotiation,
  getRoles,
  getRoster,
  getTeamInvites,
} from "@/data/api";
import { RosterScreen } from "@/features/roles/roster-screen";
import { getSessionMember } from "@/server/session";

/** 팀 탭 — 07 팀 역할 조율. */
export default async function TeamPage() {
  const team = await getCurrentTeam();
  const session = await getSessionMember();
  const [roles, roster, tools, negotiation, rejoinRequests, joinRequests, invites] =
    await Promise.all([
      getRoles(),
      getRoster(team.id),
      getRandomTools(),
      getRoleNegotiation(team.id),
      getRejoinRequests(team.id),
      getJoinRequests(team.id),
      getTeamInvites(team.id),
    ]);

  return (
    <RosterScreen
      team={team}
      roles={roles}
      roster={roster}
      tools={tools}
      negotiation={negotiation}
      rejoinPending={rejoinRequests.length + joinRequests.rows.length}
      /** 초대 관리는 팀장만 한다. `getTeamInvites` 도 팀장만 읽지만, 화면을 그리기 전에
          클라이언트도 알아야 해서 여기도 본다 — 못 보면 버튼을 아예 띄우지 않는다. */
      invites={session?.isLeader ? invites : []}
      isLeader={session?.isLeader ?? false}
    />
  );
}
