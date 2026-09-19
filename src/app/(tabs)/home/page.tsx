import {
  getAiTools,
  getCurrentTeam,
  getRecentItems,
  getRoles,
  getRoleNegotiation,
  getRoster,
  getTasks,
} from "@/data/api";
import { HomeScreen } from "@/features/home/home-screen";

/** 홈 탭 — 11 홈. */
export default async function HomePage() {
  const team = await getCurrentTeam();
  const [roles, roster, recent, aiTools, tasks, negotiation] = await Promise.all([
    getRoles(),
    getRoster(team.id),
    getRecentItems(team.id),
    getAiTools(),
    getTasks(team.id),
    getRoleNegotiation(team.id),
  ]);

  return (
    <HomeScreen
      team={team}
      roles={roles}
      roster={roster}
      recent={recent}
      aiTools={aiTools}
      tasks={tasks}
      negotiation={negotiation}
    />
  );
}
