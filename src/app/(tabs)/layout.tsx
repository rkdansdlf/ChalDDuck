import { AppNav } from "@/components/app-nav";
import { AppShell } from "@/components/ui";
import { getCurrentTeam, getDmThreads, getMyContrib } from "@/data/api";

/**
 * 탭 셸.
 *
 * 하단 5탭(좁은 화면)과 왼쪽 세로 막대(넓은 화면)가 붙는 모든 화면의 공통 껍데기다.
 * 내비게이션은 레이아웃에 있으므로 탭을 옮겨도 다시 렌더되지 않고,
 * 각 화면은 자기 `AppBar` 와 `Body` 만 그린다.
 *
 * 배지 숫자는 목록이 있어야 셀 수 있어 여기서 읽어 내비게이션에 넘긴다.
 */
export default async function TabsLayout({ children }: LayoutProps<"/">) {
  const team = await getCurrentTeam();
  const [dmThreads, myContrib] = await Promise.all([
    getDmThreads(team.id),
    getMyContrib(team.id),
  ]);

  return (
    <AppShell
      sideNav={<AppNav as="side" dmThreads={dmThreads} myContrib={myContrib} />}
      tabBar={<AppNav as="tabs" dmThreads={dmThreads} myContrib={myContrib} />}
    >
      {children}
    </AppShell>
  );
}
