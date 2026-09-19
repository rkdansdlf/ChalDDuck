"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppBar, Body, Note, Toast, Undecided } from "@/components/ui";
import type { ChatMessage, Member, Team } from "@/lib/types";
import { TEAM_THREAD_ID } from "@/lib/types";
import { useMe } from "@/features/onboarding/use-me";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { useChatThread } from "./use-chat-thread";

/**
 * 19 팀플 단톡방.
 *
 * 팀 전체가 보는 대화방 하나. 쿠션 번역기로 다듬어 보낸 말에는 **표시가 남는다** —
 * 다듬었다는 사실을 숨기면 받는 사람이 원문을 오해할 수 있다.
 */
export function TeamChatScreen({
  team,
  messages: fromServer,
  me: fromRoster,
}: {
  team: Team;
  messages: ChatMessage[];
  me: Member | undefined;
}) {
  const router = useRouter();
  const me = useMe(fromRoster);
  const { messages, send, retry } = useChatThread(TEAM_THREAD_ID, fromServer, me);
  const [toast, setToast] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 말이 오면 맨 아래로 — 대화는 마지막 줄이 기준점이다.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

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

      <Body dense className="flex flex-col gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            showAuthor
            onRetry={() => retry(message)}
          />
        ))}

        <Note tone="info" icon="wand-sparkles" className="mt-2">
          쿠션 번역기로 다듬은 말은 <b>표시가 남습니다</b>. 원문을 숨기지 않습니다.
        </Note>

        <Undecided>
          채널을 여러 개 두는지, 메시지 삭제가 되는지는 기획안에 없어 팀 전체가 보는 단일 채팅방으로만
          구성했습니다.
        </Undecided>

        <div ref={bottomRef} />
      </Body>

      <Composer
        placeholder="메시지 입력"
        onSend={send}
        onAttach={() => flash("첨부는 아직 준비 중입니다")}
        // TODO(15 쿠션 번역기): 입력 중이던 글을 들고 넘어가야 한다. 지금은 빈 화면으로 연다.
        onCushion={() => router.push("/tools/cushion")}
      />

      <Toast msg={toast} />
    </>
  );
}
