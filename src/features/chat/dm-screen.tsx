"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AppBar, Body, Note } from "@/components/ui";
import type { ChatMessage, DmThread, Member } from "@/lib/types";
import { useMe } from "@/features/onboarding/use-me";
import { markThreadRead } from "@/server/actions/chat";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { useChatThread } from "./use-chat-thread";

/**
 * 31 1:1 DM 대화.
 *
 * 단톡방(19)과 **같은 말풍선 규격**을 쓴다. 상대가 한 명뿐이라 이름만 붙이지 않는다.
 */
export function DmScreen({
  thread,
  messages: fromServer,
  me: fromRoster,
}: {
  thread: DmThread;
  messages: ChatMessage[];
  me: Member | undefined;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const { messages, send, retry } = useChatThread(thread.id, fromServer, me);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 열었으면 읽은 것이다 — 목록과 탭 배지의 안 읽음 수가 함께 내려간다.
  useEffect(() => {
    markThreadRead(thread.id);
  }, [thread.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <>
      <AppBar
        title={thread.name}
        sub={thread.mbti ?? "MBTI 미입력"}
        onBack={() => router.push("/chat/dm")}
        hideBackOnWide
      />

      <Body dense className="flex flex-col gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showAuthor={false}
            onRetry={() => retry(message)}
          />
        ))}

        <Note tone="info" icon="lock" className="mt-2">
          이 대화는 <b>{thread.name}님과 나만</b> 봅니다. 팀 전체 단톡방과는 분리되어 있습니다.
        </Note>

        <div ref={bottomRef} />
      </Body>

      <Composer placeholder={`${thread.name}님에게 메시지`} onSend={send} />
    </>
  );
}
