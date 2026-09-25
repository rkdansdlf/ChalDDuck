"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AppBar, Body, Note, Toast, Undecided } from "@/components/ui";
import type { ChatMessage, Member, Team } from "@/lib/types";
import { TEAM_THREAD_ID } from "@/lib/types";
import { useMe } from "@/features/onboarding/use-me";
import { handOffToCushion } from "@/features/tools/cushion-handoff";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { useChatThread, useLoadOlderOnScroll, useStickToBottom } from "./use-chat-thread";

/**
 * 19 팀플 단톡방.
 *
 * 팀 전체가 보는 대화방 하나. 쿠션 번역기로 다듬어 보낸 말에는 **표시가 남는다** —
 * 다듬었다는 사실을 숨기면 받는 사람이 원문을 오해할 수 있다.
 */
export function TeamChatScreen({
  team,
  messages: fromServer,
  initialCursor,
  me: fromRoster,
}: {
  team: Team;
  messages: ChatMessage[];
  initialCursor: string | null;
  me: Member | undefined;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const { messages, send, retry, hasMore, isLoadingMore, loadOlder } = useChatThread(
    TEAM_THREAD_ID,
    fromServer,
    initialCursor,
    me,
  );
  const [toast, setToast] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLoadOlderOnScroll(scrollRef, topRef, hasMore, loadOlder);

  // 새 말이 오면 맨 아래로 — 과거 메시지를 앞에 붙였을 때나 위로 올려 읽는 중일
  // 때는 움직이지 않는다.
  const { stick } = useStickToBottom(scrollRef, bottomRef, messages.at(-1)?.id);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  return (
    <>
      <AppBar
        title={team.name}
        sub={`${team.memberCount}명 · 단체 채팅방 1개`}
        onBack={() => router.push("/chat")}
        hideBackOnWide
        action="users-round"
        actionLabel="참여자 보기"
        onAction={() => router.push("/team")}
      />

      <Note tone="info" icon="wand-sparkles" className="mx-4 mt-3">
        쿠션 번역기로 다듬은 말은 <b>표시가 남습니다</b>. 원문을 숨기지 않습니다.
      </Note>

      <Body ref={scrollRef} dense className="flex flex-col gap-3">
        <div ref={topRef} />
        {isLoadingMore ? (
          <div className="pb-1 text-center font-medium text-[12px] leading-none text-txt-faint">
            이전 대화 불러오는 중…
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} showAuthor onRetry={retry} />
        ))}

        <Undecided>
          채널을 여러 개 두는지, 메시지 삭제가 되는지는 기획안에 없어 팀 전체가 보는 단일 채팅방으로만
          구성했습니다.
        </Undecided>

        <div ref={bottomRef} />
      </Body>

      <Composer
        placeholder="메시지 입력"
        // 올려 보던 중에 보냈더라도 내가 방금 쓴 말은 보여야 한다.
        onSend={(text) => {
          stick();
          send(text);
        }}
        onAttach={() => flash("첨부는 아직 준비 중입니다")}
        // 입력 중이던 글을 들고 넘어간다. 비어 있으면 쿠션 번역기는 예시 문장으로 열린다.
        onCushion={(draft) => {
          handOffToCushion(draft);
          router.push("/tools/cushion");
        }}
      />

      <Toast msg={toast} />
    </>
  );
}
