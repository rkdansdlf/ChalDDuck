"use client";

import { useState } from "react";
import { AppBar, Body } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage, DmThread, Team } from "@/lib/types";
import { ChatThreadList } from "./chat-thread-list";

const FILTERS = [
  { key: "all", label: "전체" },
  { key: "team", label: "팀 대화" },
  { key: "dm", label: "개인 대화" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

/**
 * 32 채팅 (통합 목록) — 하단 '채팅' 탭의 진입 화면.
 *
 * 팀 대화와 개인 대화가 한 목록에 있고 필터로 나눠 본다.
 * 넓은 화면에서는 이 목록이 왼쪽 기둥으로 빠지므로 이 화면은 좁은 화면 전용이다.
 */
export function ChatHubScreen({
  team,
  teamMessages,
  threads,
}: {
  team: Team;
  teamMessages: ChatMessage[];
  threads: DmThread[];
}) {
  const [filter, setFilter] = useState<Filter>("all");

  return (
    <>
      <AppBar title="채팅" sub={team.name} />

      <Body dense>
        <div role="tablist" aria-label="대화 종류" className="mb-3.5 flex gap-1.5">
          {FILTERS.map((item) => {
            const on = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "min-h-11 cursor-pointer rounded-xl px-3.5 font-bold text-[13px] leading-none",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <ChatThreadList
          team={team}
          teamMessages={teamMessages}
          threads={threads}
          show={filter}
        />
      </Body>
    </>
  );
}
