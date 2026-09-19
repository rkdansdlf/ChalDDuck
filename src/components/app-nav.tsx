"use client";

import { SideNav, TabBar } from "@/components/ui";
import { useMyContrib, usePendingContribCount } from "@/features/contrib/records-state";
import { usePendingTeamCount } from "@/features/roles/negotiation-state";
import { usePendingScheduleCount } from "@/features/schedule/meeting-state";
import type { ContribRecord, DmThread } from "@/lib/types";

/**
 * 앱 내비게이션 — 배지 숫자를 붙여 준다.
 *
 * 좁은 화면의 하단 탭바와 넓은 화면의 세로 막대는 **같은 숫자**를 보여야 하므로
 * 계산을 여기 한 곳에 두고 모양만 `as` 로 고른다.
 *
 * `TabBar`·`SideNav` 자체는 숫자를 어디서 가져올지 모르는 채로 둔다. "확인이 필요한 건수"를
 * 아는 쪽은 각 기능이고, 그 값을 스토어에 올려 두면 내비게이션이 읽어 간다.
 *
 * TODO(서버): 드라이브 마감 배지는 서버가 붙은 뒤에 같은 방식으로 더한다.
 */
export function AppNav({
  as,
  dmThreads,
  myContrib,
}: {
  as: "tabs" | "side";
  dmThreads: DmThread[];
  myContrib: ContribRecord[];
}) {
  // 팀 탭에는 두 가지가 모인다 — 겹친 역할과 확인 대기 중인 기여 기록.
  const clashes = usePendingTeamCount();
  const contrib = usePendingContribCount(useMyContrib(myContrib));
  const cal = usePendingScheduleCount();
  // 안 읽음 수는 서버가 ReadMark 로 센다.
  const chat = dmThreads.reduce((sum, t) => sum + t.unread, 0);

  const pending = {
    team: clashes + contrib || undefined,
    cal: cal || undefined,
    chat: chat || undefined,
  };

  return as === "side" ? <SideNav pending={pending} /> : <TabBar pending={pending} />;
}
