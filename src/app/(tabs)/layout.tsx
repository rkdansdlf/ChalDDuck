import { AppNav } from "@/components/app-nav";
import { AppShell } from "@/components/ui";
import { getCurrentTeam } from "@/data/api";
import { readNavBadges } from "@/server/nav/badges";
import { requireSessionMember } from "@/server/session";

/**
 * 탭 셸.
 *
 * 하단 5탭(좁은 화면)과 왼쪽 세로 막대(넓은 화면)가 붙는 모든 화면의 공통 껍데기다.
 * 내비게이션은 레이아웃에 있으므로 탭을 옮겨도 다시 렌더되지 않고,
 * 각 화면은 자기 `AppBar` 와 `Body` 만 그린다.
 *
 * 배지 숫자는 `readNavBadges` 한 곳(count 전용 쿼리)에서 읽는다 — 폴링(`pollNavBadges`)이
 * 다시 세어 오는 값과 같은 계산이어야 하기 때문이다.
 */
export default async function TabsLayout({ children }: LayoutProps<"/">) {
  // 세션·팀이 있는지 확인하고, 없으면 /join 으로 보낸다.
  await getCurrentTeam();
  const me = await requireSessionMember();
  const badges = await readNavBadges(me);

  return (
    <AppShell
      sideNav={<AppNav as="side" initial={badges} />}
      tabBar={<AppNav as="tabs" initial={badges} />}
    >
      {children}
    </AppShell>
  );
}
