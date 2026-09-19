import { getDemoTeam, getTasks } from "@/data/api";
import { PokeScreen } from "@/features/tasks/poke-screen";

/** 24 익명 콕 찌르기. */
export default async function PokePage() {
  const team = await getDemoTeam();
  const tasks = await getTasks(team.id);
  return <PokeScreen tasks={tasks} />;
}
