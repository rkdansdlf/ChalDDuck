import { getCurrentTeam, getMenuOptions, getMenuPick } from "@/data/api";
import { RouletteScreen } from "@/features/social/roulette-screen";

/** 29 친목 · 메뉴 룰렛. */
export default async function RoulettePage() {
  const team = await getCurrentTeam();
  // 정해진 밥은 팀에 하나다 — 폰마다 따로 돌리지 않는다.
  const [options, pick] = await Promise.all([getMenuOptions(team.id), getMenuPick(team.id)]);
  return <RouletteScreen options={options} pick={pick} />;
}
