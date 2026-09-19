import { getDemoTeam, getDmThreads } from "@/data/api";
import { DmListScreen } from "@/features/chat/dm-list-screen";

/** 30 1:1 DM 목록. */
export default async function DmListPage() {
  const team = await getDemoTeam();
  const threads = await getDmThreads(team.id);

  return <DmListScreen threads={threads} />;
}
