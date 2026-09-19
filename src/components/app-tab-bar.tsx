"use client";

import { TabBar } from "@/components/ui";
import { usePendingChatCount } from "@/features/chat/messages-state";
import { usePendingTeamCount } from "@/features/roles/negotiation-state";
import { usePendingScheduleCount } from "@/features/schedule/meeting-state";
import { useMyContrib, usePendingContribCount } from "@/features/contrib/records-state";
import type { ContribRecord, DmThread } from "@/lib/types";

/**
 * 탭 셸이 쓰는 탭바 — 배지 숫자를 붙여 준다.
 *
 * `TabBar` 자체는 숫자를 어디서 가져올지 모르는 채로 둔다. "확인이 필요한 건수"를
 * 아는 쪽은 각 기능이고, 그 값을 스토어에 올려 두면 탭바가 읽어 간다.
 *
 * TODO(서버): 드라이브 마감 배지는 서버가 붙은 뒤에 같은 방식으로 더한다.
 */
export function AppTabBar({
  dmThreads,
  myContrib,
}: {
  dmThreads: DmThread[];
  myContrib: ContribRecord[];
}) {
  // 팀 탭에는 두 가지가 모인다 — 겹친 역할과 확인 대기 중인 기여 기록.
  const clashes = usePendingTeamCount();
  const contrib = usePendingContribCount(useMyContrib(myContrib));
  const team = clashes + contrib;
  const cal = usePendingScheduleCount();
  const chat = usePendingChatCount(dmThreads);

  return (
    <TabBar
      pending={{ team: team || undefined, cal: cal || undefined, chat: chat || undefined }}
    />
  );
}
