"use client";

import { TabBar } from "@/components/ui";
import { usePendingTeamCount } from "@/features/roles/negotiation-state";

/**
 * 탭 셸이 쓰는 탭바 — 배지 숫자를 붙여 준다.
 *
 * `TabBar` 자체는 숫자를 어디서 가져올지 모르는 채로 둔다. "확인이 필요한 건수"를
 * 아는 쪽은 화면이고, 그 값을 스토어에 올려 두면 탭바가 읽어 간다.
 *
 * TODO(서버): 지금은 팀 탭(겹친 역할)만 세고 있다. 드라이브 마감·읽지 않은 대화 등
 * 나머지 탭의 배지는 서버가 붙은 뒤에 같은 방식으로 더한다.
 */
export function AppTabBar() {
  const team = usePendingTeamCount();
  return <TabBar pending={{ team: team || undefined }} />;
}
