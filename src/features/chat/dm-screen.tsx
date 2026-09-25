"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AppBar, Body, Note } from "@/components/ui";
import type { ChatMessage, DmThread, Member } from "@/lib/types";
import { useMe } from "@/features/onboarding/use-me";
import { markThreadRead } from "@/server/actions/chat";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { useChatThread, useLoadOlderOnScroll, useStickToBottom } from "./use-chat-thread";

/**
 * 31 1:1 DM 대화.
 *
 * 단톡방(19)과 **같은 말풍선 규격**을 쓴다. 상대가 한 명뿐이라 이름만 붙이지 않는다.
 */
export function DmScreen({
  thread,
  messages: fromServer,
  initialCursor,
  me: fromRoster,
}: {
  thread: DmThread;
  messages: ChatMessage[];
  initialCursor: string | null;
  me: Member | undefined;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const { messages, send, retry, hasMore, isLoadingMore, loadOlder } = useChatThread(
    thread.id,
    fromServer,
    initialCursor,
    me,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useLoadOlderOnScroll(scrollRef, topRef, hasMore, loadOlder);

  // 열었으면 읽은 것이다 — 목록과 탭 배지의 안 읽음 수가 함께 내려간다.
  useEffect(() => {
    markThreadRead(thread.id);
  }, [thread.id]);

  // 새 말이 오면 맨 아래로 — 과거 메시지를 앞에 붙였을 때나 위로 올려 읽는 중일
  // 때는 움직이지 않는다.
  const { stick } = useStickToBottom(scrollRef, bottomRef, messages.at(-1)?.id);

  return (
    <>
      <AppBar
        title={thread.name}
        sub={thread.mbti ?? "MBTI 미입력"}
        onBack={() => router.push("/chat/dm")}
        hideBackOnWide
      />

      <Note tone="info" icon="lock" className="mx-4 mt-3">
        이 대화는 <b>{thread.name}님과 나만</b> 봅니다. 팀 전체 단톡방과는 분리되어 있습니다.
      </Note>

      <Body ref={scrollRef} dense className="flex flex-col gap-3">
        <div ref={topRef} />
        {isLoadingMore ? (
          <div className="pb-1 text-center font-medium text-[12px] leading-none text-txt-faint">
            이전 대화 불러오는 중…
          </div>
        ) : null}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} showAuthor={false} onRetry={retry} />
        ))}

        <div ref={bottomRef} />
      </Body>

      <Composer
        placeholder={`${thread.name}님에게 메시지`}
        // 올려 보던 중에 보냈더라도 내가 방금 쓴 말은 보여야 한다.
        onSend={(text) => {
          stick();
          send(text);
        }}
      />
    </>
  );
}
