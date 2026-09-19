"use client";

import type { ReactNode } from "react";

/**
 * 탭 화면의 셸.
 *
 * 화면 폭에 따라 세 가지로 보인다.
 * - **600px 미만(모바일)**: 뷰포트를 꽉 채우고 하단 탭바로 이동한다.
 * - **600~1023px(태블릿)**: 본문이 860px 까지만 넓어지고 가운데 정렬된다. 탭바는 그대로 아래.
 *   한 줄이 지나치게 길어지면 읽는 눈이 줄 끝에서 다음 줄 앞을 못 찾는다.
 * - **1024px 이상(데스크톱)**: 탭바가 왼쪽 세로 막대(`SideNav`)로 바뀌고 본문에 폭을 내준다.
 *
 * 본문 기둥이 `relative` 인 것은 `Sheet`·`Toast` 가 이 기둥을 기준으로 떠야 하기 때문이다 —
 * 뷰포트 기준으로 띄우면 넓은 화면에서 화면 구석에 나타난다.
 */
export function AppShell({
  sideNav,
  tabBar,
  children,
}: {
  /** 넓은 화면의 세로 내비게이션. 좁은 화면에서는 스스로 숨는다. */
  sideNav: ReactNode;
  /** 좁은 화면의 하단 탭바. */
  tabBar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh bg-cr-100">
      {sideNav}

      <div className="flex min-w-0 flex-1 justify-center">
        <div className="relative flex h-dvh w-full max-w-[860px] flex-col overflow-hidden bg-page lg:border-x lg:border-line">
          {children}
          <div className="lg:hidden">{tabBar}</div>
        </div>
      </div>
    </div>
  );
}
