import { getDemoTeam, getRandomTools, getRoles, getRoster } from "@/data/api";
import { RosterScreen } from "@/features/roles/roster-screen";

/**
 * 팀 탭 — 07 팀 역할 조율.
 *
 * 이 탭에 들어올 나머지 화면(16·17·18 기여도, 23 기록 정정, 24 콕 찌르기,
 * 28 아이스브레이킹, 29 메뉴 룰렛)은 아직 만들지 않았다.
 */
export default async function TeamPage() {
  const team = await getDemoTeam();
  const [roles, roster, tools] = await Promise.all([
    getRoles(),
    getRoster(team.id),
    getRandomTools(),
  ]);

  return <RosterScreen team={team} roles={roles} roster={roster} tools={tools} />;
}
