"use client";

import { useRouter, usePathname } from "next/navigation";
import { Avatar, Icon, Rows, SecTitle } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage, DmThread, Team } from "@/lib/types";
import { TEAM_THREAD_ID } from "@/lib/types";
import { useThreadMessages, useUnreadThreads } from "./messages-state";
import { ThreadRow } from "./thread-row";

/**
 * 대화 목록.
 *
 * 좁은 화면에서는 32 화면의 본문으로, 넓은 화면에서는 왼쪽 기둥으로 쓴다.
 * 같은 목록을 두 벌 만들면 한쪽만 고쳐지는 일이 생긴다.
 *
 * `variant="pane"` 은 기둥용 — 섹션 제목과 여백을 줄이고, 지금 보고 있는 대화를 표시한다.
 */
export function ChatThreadList({
  team,
  teamMessages,
  threads: fromServer,
  variant = "page",
  show = "all",
}: {
  team: Team;
  teamMessages: ChatMessage[];
  threads: DmThread[];
  variant?: "page" | "pane";
  /** 32 화면의 필터. 기둥에서는 항상 전부 보여 준다. */
  show?: "all" | "team" | "dm";
}) {
  const router = useRouter();
  const pathname = usePathname();

  const threads = useUnreadThreads(fromServer);
  const messages = useThreadMessages(TEAM_THREAD_ID, teamMessages);
  // 전송에 실패한 말은 아직 아무도 못 봤으므로 목록의 미리보기가 되면 안 된다.
  const lastTeamMessage = messages.findLast((m) => m.status === "sent");

  const pane = variant === "pane";
  const teamActive = pathname === "/chat/team";

  const teamRow = (
    <ThreadRow
      active={pane && teamActive}
      leading={
        <span className="grid size-[42px] flex-none place-items-center rounded-full bg-yellow-100 text-yellow-700">
          <Icon name="users-round" size={19} />
        </span>
      }
      title={team.name}
      time={lastTeamMessage?.time ?? ""}
      preview={
        lastTeamMessage ? `${lastTeamMessage.author}: ${lastTeamMessage.text}` : "아직 대화가 없습니다"
      }
      onClick={() => router.push("/chat/team")}
    />
  );

  const dmRows = threads.map((thread) => (
    <ThreadRow
      key={thread.id}
      active={pane && pathname === `/chat/dm/${thread.id}`}
      leading={<Avatar name={thread.name} mbti={thread.mbti} size={42} />}
      title={thread.name}
      time={thread.time}
      preview={thread.lastMessage}
      unread={thread.unread}
      onClick={() => router.push(`/chat/dm/${thread.id}`)}
    />
  ));

  if (pane) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={cn("px-4 pt-4 pb-2", "t-sec text-txt-strong")}>채팅</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {teamRow}
          {dmRows}
        </div>
      </div>
    );
  }

  return (
    <>
      {show !== "dm" ? (
        <>
          <SecTitle note="팀 전체가 보는 대화방 1개">팀 대화</SecTitle>
          <Rows className={show === "all" ? "mb-4" : undefined}>{teamRow}</Rows>
        </>
      ) : null}

      {show !== "team" ? (
        <>
          <SecTitle note="팀원과 나눈 1:1 대화">개인 대화 {threads.length}개</SecTitle>
          <Rows>{dmRows}</Rows>
        </>
      ) : null}
    </>
  );
}
