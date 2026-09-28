import { getCurrentTeam, getMenuDraw, getMenuOptions, getRandomTools } from "@/data/api";
import { RouletteScreen } from "@/features/social/roulette-screen";

/** 29 친목 · 누가 하지. */
export default async function RoulettePage() {
  const team = await getCurrentTeam();
  // 정해진 밥은 팀에 하나다 — 폰마다 따로 돌리지 않는다. 도구도 결과의 짝이므로 같이 내려받는다.
  const [options, tools, draw] = await Promise.all([
    getMenuOptions(team.id),
    getRandomTools(),
    getMenuDraw(team.id),
  ]);
  return <RouletteScreen options={options} tools={tools} pick={draw.pick} tool={draw.tool} />;
}
