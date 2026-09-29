"use client";

import { memo, useState } from "react";
import { Avatar, Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import { displayTextOf } from "@/lib/read-cushion";
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
 * **읽기 순화도 여기서 그린다.** 순화본이 있으면 순화문을, 없으면 원문을 보인다 —
 * 어느 쪽을 그릴지 고르는 계산은 `lib/read-cushion.ts` 한 곳에 있다(서버와 같은 규칙).
 * 그리고 **누르면 원문으로 돌아간다.** 순화는 읽기 전용이라는 약속의 반대편이 대조다 —
 * 돌아갈 길이 없으면 그 기능은 "상대 말을 대신 쓰는 것"이 된다.
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
  /**
   * 이 말의 순화문. **없으면 원문으로 그린다.**
   *
   * 말에 붙어 있지 않고 따로 온다(`ChatMessage` 에서 뺐다 — 사람이 한 말과 낙관적 말풍선이
   * 같은 모양을 유지하도록). `undefined` 와 `null` 은 같은 뜻(순화본 없음)으로 받는다.
   */
  purifiedText?: string | null;
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

  // 누르고 있으면 원문으로, 놓으면 순화문으로. 이 상태는 **말풍선마다** 따로다 —
  // 한 말만 대조해 보고 싶은데 방 전체가 원문으로 바뀌면 대조가 아니라 후퇴가 된다.
  const [showOriginal, setShowOriginal] = useState(false);
  const { text: displayText, kind } = displayTextOf(message, showOriginal);
  /** 화면에 그리는 글과 **보관된 원문**이 다르다 — 표시가 남아야 할 때. */
  const changed = displayText !== message.text;
  /**
   * 라벨은 **누가 쓴 문장인지**로 갈린다.
   *
   * `ai`(모델이 쓴 순화문)와 `mask`(규칙으로 위험 표현만 가린 것)은 **다른 라벨**이어야 한다.
   * AI 가 거절돼 규칙이 대신 가렸는데 "다듬어 읽음" 이라 쓰면 그건 거짓말이다 — 읽는 사람은
   * "말투가 바뀐 것"으로 오해하고, 다음에는 그 라벨을 믿고 원문 보기를 누르지 않는다.
   */
  const label = kind === "FALLBACK" ? "공격적 표현 가림" : "다듬어 읽음";

  return (
    <div className={cn("animate-slide-up flex items-start gap-[9px]", mine ? "flex-row-reverse" : "flex-row")}>
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
              "text-pretty-keep rounded-2xl px-[13px] py-2.5 text-[14.5px] leading-[1.55] text-txt-strong shadow-2xs transition-all duration-150",
              mine ? "bg-yellow-300" : "border border-line bg-card",
              (message.attachment || message.driveFile) && "mt-1",
            )}
          >
            {displayText}
          </div>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {message.viaCushion ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] font-semibold text-yellow-800">
              <Icon name="wand-sparkles" size={11} className="animate-wiggle" />
              <span>쿠션 번역</span>
            </span>
          ) : null}

          {changed ? (
            <button
              type="button"
              onClick={() => setShowOriginal((prev) => !prev)}
              aria-pressed={showOriginal}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-card/90 px-2 py-0.5 text-[11px] font-medium text-txt-muted shadow-2xs transition-colors hover:bg-fill active:scale-95"
            >
              <Icon
                name={showOriginal ? "eye" : kind === "FALLBACK" ? "shield" : "wand-sparkles"}
                size={11}
                className={kind === "FALLBACK" ? "text-amber-600" : "text-yellow-600"}
              />
              <span>{showOriginal ? `원문 · ${label} 보기` : `${label} · 원문 보기`}</span>
            </button>
          ) : null}

          {message.status === "failed" ? (
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-bold text-[11.5px] leading-none text-err active:scale-95"
              >
                <Icon name="circle-alert" size={12} />
                전송 실패 · 다시 보내기
              </button>
              {onDiscard ? (
                <button
                  type="button"
                  onClick={() => onDiscard(message)}
                  className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-medium text-[11.5px] leading-none text-txt-faint active:scale-95"
                >
                  <Icon name="x" size={12} />
                  지우기
                </button>
              ) : null}
            </span>
          ) : (
            <span className={cn("font-medium text-[11.5px] leading-none text-txt-faint", message.status === "sending" && "animate-pulse-subtle")}>
              {message.status === "sending" ? "보내는 중…" : message.time}
            </span>
          )}
        </div>

        {message.reactions && message.reactions.length > 0 ? (
          <div className="mt-[5px] flex gap-[5px]">
            {message.reactions.map((reaction, i) => (
              <span
                key={i}
                className="inline-flex cursor-default select-none items-center gap-[3px] rounded-full bg-fill px-2 py-[3px] font-semibold text-[12px] leading-none text-txt-muted transition-transform duration-150 hover:scale-110 active:scale-95"
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
