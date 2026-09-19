"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

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
  onSend,
  onAttach,
  onCushion,
}: {
  placeholder: string;
  onSend: (text: string) => void;
  /** 단톡방에만 있는 첨부·쿠션 번역기 버튼. 주지 않으면 그리지 않는다. */
  onAttach?: () => void;
  onCushion?: () => void;
}) {
  const [text, setText] = useState("");

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-none items-center gap-2 border-t border-line px-3.5 py-2.5 backdrop-blur-md"
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
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-full border-none bg-fill text-txt-muted"
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
        className="t-input min-h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-input-border bg-card px-3.5 text-txt-strong outline-none"
      />

      {onCushion ? (
        <button
          type="button"
          onClick={onCushion}
          aria-label="쿠션 번역기로 다듬기"
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-full border-none bg-yellow-200 text-yellow-700"
        >
          <Icon name="wand-sparkles" size={18} />
        </button>
      ) : null}

      <button
        type="submit"
        aria-label="보내기"
        className="grid size-11 flex-none cursor-pointer place-items-center rounded-full border-none bg-ink-700 text-on-action"
      >
        <Icon name="send" size={17} />
      </button>
    </form>
  );
}
