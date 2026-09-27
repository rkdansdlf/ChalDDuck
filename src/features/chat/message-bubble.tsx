"use client";

import { memo, useMemo } from "react";
import { Avatar, Chip, Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { softenProfanity } from "@/lib/profanity";
import type { ChatMessage } from "@/lib/types";
import { ChatAttachment, SharedDriveCard } from "./chat-attachment";

/**
 * 말풍선 하나.
 *
 * 단톡방(19)과 DM(31)이 **같은 규격**을 쓴다. 두 화면에서 같은 말이 다르게 보이면
 * 같은 대화라는 감각이 깨지므로, 규격을 바꿀 일이 있으면 여기만 고친다.
 *
 * 차이는 하나뿐이다: 단톡방은 상대 이름을 말풍선 위에 붙이고, DM 은 상대가 한 명뿐이라 붙이지 않는다.
 *
 * `memo` 를 붙였다 — 메시지 하나를 보내면 배열이 새로 만들어지지만, 바뀌지 않은
 * 말풍선까지 매번 다시 그릴 이유는 없다. `onRetry` 를 메시지별 클로저 대신 `retry`
 * 자체(안정된 참조)로 받아야 이 `memo` 가 실제로 걸린다 — 호출부를 함께 보라.
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  showAuthor,
  onRetry,
  onDiscard,
  onSaveToDrive,
}: {
  message: ChatMessage;
  /** 여러 사람이 있는 방에서만 상대 이름을 보여 준다. */
  showAuthor: boolean;
  onRetry: (message: ChatMessage) => void;
  /**
   * 실패한 말을 버린다.
   *
   * 이게 없으면 못 가는 실패 말풍선이 화면에 계속 남는다 — 저장소에서 사라진 파일은
   * 다시 보내도 항상 실패하는데, 지우는 방법이 없어서 사용자는 새로고침할 수밖에 없고
   * 새로고침하면 대화 내용까지 잃는다.
   */
  onDiscard?: (message: ChatMessage) => void;
  /** 이 첨부를 드라이브에 올린다. 단톡방에서만 넘긴다 — DM 은 첨부를 두지 않는다. */
  onSaveToDrive?: (message: ChatMessage) => void;
}) {
  const mine = message.isMine;
  const { text: displayText, masked } = useMemo(() => softenProfanity(message.text), [message.text]);

  return (
    <div className={cn("flex items-start gap-[9px]", mine ? "flex-row-reverse" : "flex-row")}>
      <Avatar name={message.author} mbti={message.mbti} size={32} />

      <div className={cn("flex max-w-[72%] flex-col", mine ? "items-end" : "items-start")}>
        {showAuthor && !mine ? (
          <div className="mb-[3px] font-semibold text-[12px] leading-[1.4] text-txt-muted">
            {message.author}
          </div>
        ) : null}

        {message.driveFile ? <SharedDriveCard file={message.driveFile} /> : null}

        {message.attachment ? (
          <ChatAttachment
            messageId={message.id}
            attachment={message.attachment}
            sent={message.status === "sent"}
            mine={mine}
            onSaveToDrive={onSaveToDrive ? () => onSaveToDrive(message) : undefined}
          />
        ) : null}

        {/* 파일만 보낸 말은 글이 비어 있다 — 빈 말풍선을 그리지 않는다. */}
        {displayText ? (
          <div
            className={cn(
              "text-pretty-keep rounded-2xl px-[13px] py-2.5 text-[14.5px] leading-[1.55] text-txt-strong",
              mine ? "bg-yellow-300" : "border border-line bg-card",
              (message.attachment || message.driveFile) && "mt-1",
            )}
          >
            {displayText}
          </div>
        ) : null}

        <div className="mt-1 flex items-center gap-1.5">
          {message.viaCushion ? (
            <Chip tone="y" icon="wand-sparkles">
              쿠션 번역기
            </Chip>
          ) : null}

          {masked ? (
            <Chip tone="n" icon="shield">
              순화됨
            </Chip>
          ) : null}

          {message.status === "failed" ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-bold text-[11.5px] leading-none text-err"
              >
                <Icon name="circle-alert" size={12} />
                전송 실패 · 다시 보내기
              </button>
              {onDiscard ? (
                <button
                  type="button"
                  onClick={() => onDiscard(message)}
                  className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-medium text-[11.5px] leading-none text-txt-faint"
                >
                  <Icon name="x" size={12} />
                  지우기
                </button>
              ) : null}
            </span>
          ) : (
            <span className="font-medium text-[11.5px] leading-none text-txt-faint">
              {message.status === "sending" ? "보내는 중…" : message.time}
            </span>
          )}
        </div>

        {message.reactions && message.reactions.length > 0 ? (
          <div className="mt-[5px] flex gap-[5px]">
            {message.reactions.map((reaction, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-[3px] rounded-full bg-fill px-2 py-[3px] font-semibold text-[12px] leading-none text-txt-muted"
              >
                <Icon name={reaction.icon as IconName} size={12} />
                {reaction.count}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});
