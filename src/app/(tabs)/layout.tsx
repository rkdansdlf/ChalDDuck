import { AppTabBar } from "@/components/app-tab-bar";
import { AppFrame, StatusBar } from "@/components/ui";

/**
 * 탭 셸.
 *
 * 하단 5탭이 붙는 모든 화면의 공통 껍데기다. 탭바는 레이아웃에 있으므로
 * 탭을 옮겨도 다시 렌더되지 않고, 각 화면은 자기 `AppBar` 와 `Body` 만 그린다.
 */
export default function TabsLayout({ children }: LayoutProps<"/">) {
  return (
    <AppFrame>
      <StatusBar />
      {children}
      <AppTabBar />
    </AppFrame>
  );
}
