"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { TABS, type TabPending } from "./tab-bar";

/**
 * 넓은 화면의 세로 내비게이션.
 *
 * 하단 탭바를 그대로 넓은 화면에 두면 화면 맨 아래까지 손이 가야 하고, 가로로 남는 공간도
 * 쓰지 못한다. 1024px 이상에서는 탭바를 왼쪽 세로 막대로 바꾸고 본문에 폭을 내준다.
 *
 * 같은 `TABS` 목록을 쓰므로 탭이 늘거나 순서가 바뀌면 두 곳이 함께 따라온다.
 */
export function SideNav({ pending = {} }: { pending?: TabPending }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="hidden w-[232px] flex-none flex-col border-r border-line bg-card px-3 py-5 lg:flex"
    >
      <Link href="/home" className="mb-5 flex items-center gap-2.5 px-2">
        <Image src="/assets/logo-mochi.png" alt="" width={32} height={32} className="size-8" />
        <span className="font-extrabold text-[18px] leading-none tracking-[-.03em] text-ink-900">
          찰떡
        </span>
      </Link>

      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const badge = pending[tab.key];
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-control px-3 font-bold text-[14.5px] leading-none",
                  active ? "bg-fill text-txt-strong" : "text-txt-muted hover:bg-cr-50",
                )}
              >
                <Icon name={tab.icon} size={19} strokeWidth={active ? 2.4 : 1.9} />
                <span className="flex-1">{tab.label}</span>
                {badge ? (
                  <span className="box-border h-5 min-w-5 rounded-full bg-coral-400 px-[5px] text-center font-bold text-[12px] leading-5 text-ink-900">
                    {badge}
                    <span className="sr-only">건 확인 필요</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
