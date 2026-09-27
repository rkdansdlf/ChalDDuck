"use client";

import { SideNav, TabBar } from "@/components/ui";
import { useEffect } from "react";
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

  // **서버가 다시 그려 준 숫자는 곧바로 반영한다.** 알림을 읽거나 DM 을 열면 화면은
  // `router.refresh()` 로 바로 맞는데, store 는 모듈 상태라 새로 그려 준 값을 받지 못하고
  // 다음 폴링(30초)까지 옛 숫자를 보여 준다 — "안 읽은 알림 2건" 이 남은 채 알림함은
  // 비어 있는 상태다. `drive-seen.tsx` 가 이미 `setNavBadges` 를 직접 부르는 것으로 이
  // 표시가 갱신된다는 것을 보여 준다.
  // 탭바 인스턴스만 한다 — 둘이 같은 값을 두 번 쓰면 폴링 결과와 깜빡인다.
  useEffect(() => {
    if (as !== "tabs") return;
    setNavBadges(initial);
  }, [as, initial]);

  const badges = useNavBadges() ?? initial;

  const pending = {
    team: badges.team || undefined,
    cal: badges.cal || undefined,
    chat: badges.chat || undefined,
    drive: badges.drive || undefined,
  };

  return as === "side" ? <SideNav pending={pending} /> : <TabBar pending={pending} />;
}
