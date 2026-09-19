import { getCurrentTeam, getRandomTools, getRoleNegotiation, getRoles, getRoster } from "@/data/api";
import { RosterScreen } from "@/features/roles/roster-screen";

/** 팀 탭 — 07 팀 역할 조율. */
export default async function TeamPage() {
  const team = await getCurrentTeam();
  const [roles, roster, tools, negotiation] = await Promise.all([
    getRoles(),
    getRoster(team.id),
    getRandomTools(),
    getRoleNegotiation(team.id),
  ]);

  return (
    <RosterScreen
      team={team}
      roles={roles}
      roster={roster}
      tools={tools}
      negotiation={negotiation}
    />
  );
}
