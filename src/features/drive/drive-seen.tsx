"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { setNavBadges } from "@/components/nav-badges-store";
import { markDriveSeen } from "@/server/actions/drive";

/**
 * 드라이브를 보고 있다고 서버에 적는다 — 드라이브 탭의 "새로 올라온 버전" 배지를 지운다.
 *
 * 드라이브 안에서 화면을 옮길 때마다 다시 적는다(`pathname`). 드라이브를 열어 둔 채 팀원이
 * 올린 것도, 그 파일을 열어 보면 배지에서 빠진다. 적고 나서 받은 숫자로 탭을 바로 고친다.
 *
 * 그리는 것은 없다. 드라이브 레이아웃에 한 번만 둔다.
 */
export function DriveSeen() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    markDriveSeen()
      .then((badges) => {
        if (!cancelled) setNavBadges(badges);
      })
      .catch(() => {
        // 배지는 다음 폴링에서 다시 맞춰진다. 화면을 막을 일이 아니다.
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
