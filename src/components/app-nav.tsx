"use client";

import { SideNav, TabBar } from "@/components/ui";
import type { DmThread } from "@/lib/types";

/**
 * 앱 내비게이션 — 배지 숫자를 붙여 준다.
 *
 * 좁은 화면의 하단 탭바와 넓은 화면의 세로 막대는 **같은 숫자**를 보여야 하므로
 * 계산을 여기 한 곳에 두고 모양만 `as` 로 고른다.
 *
 * `TabBar`·`SideNav` 자체는 숫자를 어디서 가져올지 모르는 채로 둔다. 건수는 모두 서버가
 * 세어 레이아웃에서 내려 준다 — 화면마다 따로 세면 같은 값이 서로 어긋난다.
 *
 * TODO(서버): 드라이브 마감 배지는 같은 방식으로 더한다.
 */
export function AppNav({
  as,
  dmThreads,
  contribPending,
  roleClashes,
  meetingPending,
}: {
  as: "tabs" | "side";
  dmThreads: DmThread[];
  /** 팀원 확인을 기다리는 내 기여 기록 수. 서버가 센다. */
  contribPending: number;
  /** 아직 확정되지 않은, 희망자가 겹친 역할 수. 서버가 센다. */
  roleClashes: number;
  /** 내 응답을 기다리는 회의 제안이 있으면 1. 서버가 센다. */
  meetingPending: number;
}) {
  // 팀 탭에는 두 가지가 모인다 — 겹친 역할과 확인 대기 중인 기여 기록.
  const clashes = roleClashes;
  const contrib = contribPending;
  const cal = meetingPending;
  // 안 읽음 수는 서버가 ReadMark 로 센다.
  const chat = dmThreads.reduce((sum, t) => sum + t.unread, 0);

  const pending = {
    team: clashes + contrib || undefined,
    cal: cal || undefined,
    chat: chat || undefined,
  };

  return as === "side" ? <SideNav pending={pending} /> : <TabBar pending={pending} />;
}
