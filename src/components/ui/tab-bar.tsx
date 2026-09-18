"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/**
 * 하단 5탭.
 *
 * 프로토타입은 `tab` 상태값으로 활성 탭을 직접 넘겼지만, 실제 앱에서는 **경로가 곧 탭**이다.
 * 각 탭의 `href` 가 그 탭의 대표 화면이고, 그 아래 하위 경로도 같은 탭을 활성으로 본다.
 * (예: `/drive/versions` 는 드라이브 탭)
 */
export const TABS = [
  { key: "home", label: "홈", icon: "house", href: "/home" },
  { key: "chat", label: "채팅", icon: "messages-square", href: "/chat" },
  { key: "cal", label: "일정", icon: "calendar-check", href: "/schedule" },
  { key: "drive", label: "드라이브", icon: "folder-open", href: "/drive" },
  { key: "team", label: "팀", icon: "users-round", href: "/team" },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  icon: IconName;
  href: string;
}>;

export type TabKey = (typeof TABS)[number]["key"];

/** 탭별 배지 숫자 — 확인이 필요한 항목 수. */
export type TabPending = Partial<Record<TabKey, number>>;

export function TabBar({ pending = {} }: { pending?: TabPending }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="absolute inset-x-0 bottom-0 border-t border-line backdrop-blur-md"
      style={{
        background: "rgba(255,253,249,.96)",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
      }}
    >
      <ul className="m-0 flex list-none p-0">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const badge = pending[tab.key];
          return (
            <li key={tab.key} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[54px] flex-col items-center justify-center gap-[3px]",
                  active ? "text-txt-strong" : "text-txt-faint",
                )}
              >
                <span className="relative inline-flex">
                  <Icon name={tab.icon} size={21} strokeWidth={active ? 2.4 : 1.9} />
                  {badge ? (
                    <span className="absolute -top-1 -right-[7px] box-border h-[17px] min-w-[17px] rounded-full bg-coral-400 px-1 text-center font-bold text-[11px] leading-[17px] text-ink-900">
                      {badge}
                      <span className="sr-only">건 확인 필요</span>
                    </span>
                  ) : null}
                </span>
                <span className={cn("whitespace-nowrap", active ? "t-tab-on" : "t-tab")}>
                  {tab.label}
                </span>
                {active ? (
                  <span className="absolute top-0 h-[3px] w-[22px] rounded-sm bg-yellow-400" />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
