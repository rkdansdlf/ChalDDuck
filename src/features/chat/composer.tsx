"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * 서버가 받아 주는 길이(`actions/chat.ts` 의 `MAX_MESSAGE`)와 같은 값.
 *
 * 여기서 막는 이유는 거절당한 뒤에 알려 주는 것보다 **애초에 넘겨 쓸 수 없는 편**이
 * 낫기 때문이다. 서버 쪽 제한이 진짜 문이고, 이건 그 문 앞의 안내다.
 */
const MAX_MESSAGE = 2000;

/**
 * 메시지 입력 줄.
 *
 * `Dock`·`TabBar` 와 마찬가지로 흐름 안에 둔다 — 띄워 두면 마지막 말풍선이 뒤로 들어간다.
 *
 * 폼으로 감싸서 모바일 키보드의 "보내기"와 Enter 가 같은 동작을 하게 했다.
 * 입력창 글자는 16px 이다 — 그보다 작으면 iOS 사파리가 포커스할 때 화면을 확대한다.
 */
export function Composer({
  placeholder,
  initialText = "",
  onSend,
  onAttach,
  onCushion,
}: {
  placeholder: string;
  /** 쿠션 번역기 등에서 되가져온 텍스트가 있을 때 초기값으로 채운다. */
  initialText?: string;
  onSend: (text: string) => void;
  /** 단톡방에만 있는 첨부·쿠션 번역기 버튼. 주지 않으면 그리지 않는다. */
  onAttach?: () => void;
  /** 입력 중이던 글을 넘긴다 — 쿠션 번역기가 그 글을 다듬는다. */
  onCushion?: (draft: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const [prevInitialText, setPrevInitialText] = useState(initialText);

  // 외부에서 initialText 가 새로 들어오면 렌더링 중에 즉시 상태를 동기화한다.
  if (initialText !== prevInitialText) {
    setPrevInitialText(initialText);
    setText(initialText);
  }

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const hasDraft = text.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="relative flex flex-none items-center gap-2 border-t border-line px-3.5 py-2.5 backdrop-blur-md"
      style={{
        background: "rgba(255,253,249,.96)",
        paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
      }}
    >
      {onAttach ? (
        <button
          type="button"
          onClick={onAttach}
          aria-label="첨부"
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-full border-none bg-fill text-txt-muted select-none transition-all duration-150 hover:bg-cr-200 active:scale-90"
        >
          <Icon name="paperclip" size={18} />
        </button>
      ) : null}

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // 한글 입력 중의 Enter 는 글자를 확정하는 키다. 이때 보내면 조합 중이던
          // 글자가 잘린 채 나간다. 조합이 끝난 Enter 만 전송으로 본다.
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          submit();
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={MAX_MESSAGE}
        name="chat-message"
        // 폼 안의 유일한 텍스트 필드라 크롬이 "아이디 한 칸짜리 로그인 폼"으로 오인해
        // 비밀번호 관리자 제안 줄을 키보드 위에 띄운다. off 로 그 휴리스틱을 끈다.
        autoComplete="off"
        data-composer-input
        className="t-input min-h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-input-border bg-card px-3.5 text-txt-strong outline-none transition-all duration-150 focus:border-focus"
      />

      {onCushion ? (
        <div className="relative flex-none">
          {/* 글자가 입력되었을 때 쿠션어로 다듬기를 권유하는 넛지 툴팁 */}
          {hasDraft && (
            <span className="pointer-events-none absolute -top-7 right-0 flex items-center gap-1 rounded-full bg-yellow-400 px-2 py-0.5 text-[10.5px] font-bold text-yellow-950 shadow-xs animate-bounce select-none whitespace-nowrap">
              <span>✨</span>
              <span>말투 다듬기</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onCushion(text)}
            aria-label="쿠션 번역기로 다듬기"
            title={hasDraft ? "작성 중인 말을 쿠션어로 다듬기" : "쿠션 번역기 열기"}
            className={cn(
              "grid size-11 cursor-pointer place-items-center rounded-full border-none select-none transition-all duration-200 active:scale-90",
              hasDraft
                ? "bg-yellow-300 text-yellow-950 shadow-xs ring-2 ring-yellow-400/50 hover:bg-yellow-400 hover:rotate-12"
                : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200",
            )}
          >
            <Icon name="wand-sparkles" size={18} className={hasDraft ? "animate-wiggle" : undefined} />
          </button>
        </div>
      ) : null}

      <button
        type="submit"
        aria-label="보내기"
        disabled={!text.trim()}
        className={cn(
          "grid size-11 flex-none place-items-center rounded-full border-none select-none transition-all duration-150",
          text.trim()
            ? "cursor-pointer bg-ink-700 text-on-action shadow-xs animate-pop active:scale-90"
            : "cursor-default bg-fill text-txt-disabled scale-95 opacity-60",
        )}
      >
        <Icon name="send" size={17} />
      </button>
    </form>
  );
}
