"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 대화 목록 한 줄.
 *
 * 30(DM 목록)과 32(통합 목록)가 같은 줄을 쓴다. 앞 칸만 달라서(팀 대화는 아이콘,
 * 개인 대화는 캐릭터 아바타) 그 자리를 `leading` 으로 받는다.
 */
export function ThreadRow({
  leading,
  title,
  time,
  preview,
  unread = 0,
  onClick,
}: {
  leading: ReactNode;
  title: string;
  time: string;
  preview: string;
  unread?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="box-border flex min-h-[60px] w-full cursor-pointer items-center gap-3 border-none bg-transparent px-[15px] py-[13px] text-left"
    >
      {leading}

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="t-sec text-txt-strong">{title}</span>
          <span className="ml-auto flex-none font-medium text-[12px] leading-[1.4] text-txt-faint">
            {time}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 block overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] leading-[1.5]",
            unread > 0 ? "font-semibold text-txt-strong" : "font-normal text-txt-muted",
          )}
        >
          {preview}
        </span>
      </span>

      {unread > 0 ? (
        <span className="box-border h-5 min-w-5 flex-none rounded-full bg-coral-400 px-[5px] text-center font-bold text-[12px] leading-5 text-ink-900">
          {unread}
          <span className="sr-only">개 안 읽음</span>
        </span>
      ) : null}
    </button>
  );
}
