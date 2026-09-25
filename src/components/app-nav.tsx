"use client";

import { SideNav, TabBar } from "@/components/ui";
import { usePoll } from "@/lib/use-poll";
import { pollNavBadges } from "@/server/actions/nav";
import type { NavBadges } from "@/server/nav/badges";
import { setNavBadges, useNavBadges } from "./nav-badges-store";

/**
 * 앱 내비게이션 — 배지 숫자를 붙여 준다.
 *
 * 좁은 화면의 하단 탭바와 넓은 화면의 세로 막대는 **같은 숫자**를 보여야 하므로
 * 계산을 여기 한 곳에 두고 모양만 `as` 로 고른다.
 *
 * 건수는 서버가 센다 — 화면마다 따로 세면 같은 값이 서로 어긋난다. 처음 숫자는 탭 셸이
 * 서버에서 그려 주고, 그 뒤로는 **스스로 다시 세어 온다**: 팀원이 방금 한 일(가입 요청·
 * 회의 제안·기여 기록·DM)이 내가 아무것도 누르지 않아도 배지에 나타나야 한다.
 *
 * TODO(서버): 드라이브 마감 배지는 같은 방식으로 더한다.
 */

/**
 * 배지를 다시 세는 주기.
 *
 * 대화방(3초)보다 훨씬 느긋하다. 배지는 "무언가 생겼다"는 신호라 몇십 초 늦어도 뜻이
 * 달라지지 않고, 탭을 열어 둔 모든 사람이 부르는 값이라 주기가 곧 비용이다.
 */
const BADGE_POLL_MS = 30_000;

export function AppNav({
  as,
  initial,
}: {
  as: "tabs" | "side";
  /** 탭 셸이 서버에서 세어 준 첫 숫자. 다시 세어 온 값이 있으면 그쪽이 최신이다. */
  initial: NavBadges;
}) {
  // 묻는 쪽은 하나뿐이다. 둘 다 물으면 같은 숫자에 요청이 두 배로 나간다.
  usePoll(
    async () => {
      setNavBadges(await pollNavBadges());
    },
    BADGE_POLL_MS,
    as === "tabs",
  );

  const badges = useNavBadges() ?? initial;

  const pending = {
    team: badges.team || undefined,
    cal: badges.cal || undefined,
    chat: badges.chat || undefined,
  };

  return as === "side" ? <SideNav pending={pending} /> : <TabBar pending={pending} />;
}
