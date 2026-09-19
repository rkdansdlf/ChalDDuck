"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppBar, Avatar, Body, Icon, Rows, SecTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage, DmThread, Team } from "@/lib/types";
import { useThreadMessages, useUnreadThreads } from "./messages-state";
import { TEAM_THREAD_ID } from "@/lib/types";
import { ThreadRow } from "./thread-row";

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
 * 미리보기는 실제 마지막 메시지를 읽어 오므로, 단톡방에 말을 보내면 여기도 따라 바뀐다.
 */
export function ChatHubScreen({
  team,
  teamMessages,
  threads: fromServer,
}: {
  team: Team;
  teamMessages: ChatMessage[];
  threads: DmThread[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");

  const threads = useUnreadThreads(fromServer);
  const messages = useThreadMessages(TEAM_THREAD_ID, teamMessages);
  // 전송에 실패한 말은 아직 아무도 못 봤으므로 목록의 미리보기가 되면 안 된다.
  const lastTeamMessage = messages.findLast((m) => m.status === "sent");

  const showTeam = filter !== "dm";
  const showDm = filter !== "team";

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

        {showTeam ? (
          <>
            <SecTitle note="팀 전체가 보는 대화방 1개">팀 대화</SecTitle>
            <Rows className={showDm ? "mb-4" : undefined}>
              <ThreadRow
                leading={
                  <span className="grid size-[42px] flex-none place-items-center rounded-full bg-yellow-100 text-yellow-700">
                    <Icon name="users-round" size={19} />
                  </span>
                }
                title={team.name}
                time={lastTeamMessage?.time ?? ""}
                preview={
                  lastTeamMessage
                    ? `${lastTeamMessage.author}: ${lastTeamMessage.text}`
                    : "아직 대화가 없습니다"
                }
                onClick={() => router.push("/chat/team")}
              />
            </Rows>
          </>
        ) : null}

        {showDm ? (
          <>
            <SecTitle note="팀원과 나눈 1:1 대화">개인 대화 {threads.length}개</SecTitle>
            <Rows>
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  leading={<Avatar name={thread.name} mbti={thread.mbti} size={42} />}
                  title={thread.name}
                  time={thread.time}
                  preview={thread.lastMessage}
                  unread={thread.unread}
                  onClick={() => router.push(`/chat/dm/${thread.id}`)}
                />
              ))}
            </Rows>
          </>
        ) : null}
      </Body>
    </>
  );
}
