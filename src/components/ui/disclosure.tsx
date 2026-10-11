"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/**
 * 접었다 펴는 안내 — 기본은 접혀 있고, 제목을 누르면 본문이 펼쳐진다.
 *
 * 펼침은 높이를 직접 재지 않고 `grid-rows` 0fr↔1fr 로 옮긴다. 본문 높이를 모르고도 부드럽게
 * 열리고, 접힌 상태에서는 본문이 0 높이로 숨는다.
 */
export function Disclosure({
  icon,
  title,
  tone = "info",
  children,
}: {
  icon: IconName;
  title: string;
  tone?: "info" | "warn";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const warn = tone === "warn";

  return (
    <div className={cn("overflow-hidden rounded-control", warn ? "bg-warn-bg" : "bg-info-bg")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-12 w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3.5 text-left select-none",
          "t-note-title",
          warn ? "text-warn" : "text-focus",
        )}
      >
        <Icon name={icon} size={17} />
        <span className="flex-1">{title}</span>
        <span
          className={cn(
            "inline-flex flex-none transition-transform duration-300 ease-out",
            open && "rotate-180",
          )}
        >
          <Icon name="chevron-down" size={17} />
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "t-note text-pretty-keep pr-3.5 pb-3.5 pl-[41px]",
              warn ? "text-warn" : "text-focus",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
