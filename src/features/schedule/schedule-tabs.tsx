"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";

const TABS: Array<{ key: "mine" | "team"; label: string; icon: IconName; href: string }> = [
  { key: "mine", label: "내 시간", icon: "user-round", href: "/schedule" },
  { key: "team", label: "팀 겹쳐보기", icon: "users-round", href: "/schedule/team" },
];

/**
 * 일정 탭의 두 화면 — 내 시간표를 적는 곳과 팀 시간표를 겹쳐 보는 곳.
 *
 * 탭 전환이 아니라 **주소가 다른 두 화면**이다. 팀 겹쳐보기는 팀원 전원의 시간표를 서버에서
 * 읽어야 하고, 알림에서 바로 들어올 수도 있어야 한다.
 *
 * `onLeave` 는 저장하지 않은 변경이 있는 화면이 이동을 가로챌 때 쓴다(내 시간표).
 */
export function ScheduleTabs({
  current,
  onLeave,
}: {
  current: "mine" | "team";
  onLeave?: (href: string, e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <nav aria-label="일정 보기" className="mb-3 flex gap-1.5">
      {TABS.map((t) => {
        const on = current === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            onClick={on ? undefined : (e) => onLeave?.(t.href, e)}
            className={cn(
              "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl font-bold text-[13px] leading-none no-underline",
              on
                ? "border border-transparent bg-action text-on-action"
                : "border border-line bg-card text-txt",
            )}
          >
            <Icon name={t.icon} size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
