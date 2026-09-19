import { AppTabBar } from "@/components/app-tab-bar";
import { AppFrame, StatusBar } from "@/components/ui";
import { getDemoTeam, getDmThreads, getMyContrib } from "@/data/api";

/**
 * 탭 셸.
 *
 * 하단 5탭이 붙는 모든 화면의 공통 껍데기다. 탭바는 레이아웃에 있으므로
 * 탭을 옮겨도 다시 렌더되지 않고, 각 화면은 자기 `AppBar` 와 `Body` 만 그린다.
 *
 * 배지 숫자는 목록이 있어야 셀 수 있어 여기서 읽어 탭바에 넘긴다.
 */
export default async function TabsLayout({ children }: LayoutProps<"/">) {
  const team = await getDemoTeam();
  const [dmThreads, myContrib] = await Promise.all([
    getDmThreads(team.id),
    getMyContrib(team.id),
  ]);

  return (
    <AppFrame>
      <StatusBar />
      {children}
      <AppTabBar dmThreads={dmThreads} myContrib={myContrib} />
    </AppFrame>
  );
}
