import { getDemoTeam, getMenuOptions } from "@/data/api";
import { RouletteScreen } from "@/features/social/roulette-screen";

/** 29 친목 · 메뉴 룰렛. */
export default async function RoulettePage() {
  const team = await getDemoTeam();
  const options = await getMenuOptions(team.id);
  return <RouletteScreen options={options} />;
}
