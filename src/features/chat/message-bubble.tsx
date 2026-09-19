"use client";

import { Avatar, Chip, Icon, type IconName } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

/**
 * 말풍선 하나.
 *
 * 단톡방(19)과 DM(31)이 **같은 규격**을 쓴다. 두 화면에서 같은 말이 다르게 보이면
 * 같은 대화라는 감각이 깨지므로, 규격을 바꿀 일이 있으면 여기만 고친다.
 *
 * 차이는 하나뿐이다: 단톡방은 상대 이름을 말풍선 위에 붙이고, DM 은 상대가 한 명뿐이라 붙이지 않는다.
 */
export function MessageBubble({
  message,
  showAuthor,
  onRetry,
}: {
  message: ChatMessage;
  /** 여러 사람이 있는 방에서만 상대 이름을 보여 준다. */
  showAuthor: boolean;
  onRetry: () => void;
}) {
  const mine = message.isMine;

  return (
    <div className={cn("flex items-start gap-[9px]", mine ? "flex-row-reverse" : "flex-row")}>
      <Avatar name={message.author} mbti={message.mbti} size={32} />

      <div className={cn("flex max-w-[72%] flex-col", mine ? "items-end" : "items-start")}>
        {showAuthor && !mine ? (
          <div className="mb-[3px] font-semibold text-[12px] leading-[1.4] text-txt-muted">
            {message.author}
          </div>
        ) : null}

        <div
          className={cn(
            "text-pretty-keep rounded-2xl px-[13px] py-2.5 text-[14.5px] leading-[1.55] text-txt-strong",
            mine ? "bg-yellow-300" : "border border-line bg-card",
          )}
        >
          {message.text}
        </div>

        <div className="mt-1 flex items-center gap-1.5">
          {message.viaCushion ? (
            <Chip tone="y" icon="wand-sparkles">
              쿠션 번역기
            </Chip>
          ) : null}

          {message.status === "failed" ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-bold text-[11.5px] leading-none text-err"
            >
              <Icon name="circle-alert" size={12} />
              전송 실패 · 다시 보내기
            </button>
          ) : (
            <span className="font-medium text-[11.5px] leading-none text-txt-faint">
              {message.time}
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
}
