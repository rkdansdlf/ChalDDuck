import { getAiTools, getDemoTeam, getRecentItems, getRoles, getRoster } from "@/data/api";
import { HomeScreen } from "@/features/home/home-screen";

/**
 * 홈 탭 — 11 홈.
 *
 * 이 탭에 들어올 나머지 화면(14 AI 도구 허브, 15·20·25·26·27 개별 도구, 21 할 일)은
 * 아직 만들지 않았다. 홈의 바로가기는 지금 안내만 띄운다.
 */
export default async function HomePage() {
  const team = await getDemoTeam();
  const [roles, roster, recent, aiTools] = await Promise.all([
    getRoles(),
    getRoster(team.id),
    getRecentItems(team.id),
    getAiTools(),
  ]);

  return (
    <HomeScreen team={team} roles={roles} roster={roster} recent={recent} aiTools={aiTools} />
  );
}
