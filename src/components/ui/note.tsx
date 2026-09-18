"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";
import { useReviewMode } from "@/lib/review-mode";

/** 안내·고지 배너 — 채우기만 쓰고 경계는 두지 않는다. */
const TONE = {
  info: { bg: "bg-info-bg", text: "text-focus", glyph: "text-info" },
  y: { bg: "bg-yellow-100", text: "text-[#6B5312]", glyph: "text-yellow-700" },
  warn: { bg: "bg-warn-bg", text: "text-[#6F5219]", glyph: "text-warn" },
  err: { bg: "bg-err-bg", text: "text-[#8A3B31]", glyph: "text-err" },
} as const;

export type NoteTone = keyof typeof TONE;

export function Note({
  tone = "info",
  title,
  icon,
  children,
  className,
  style,
}: {
  tone?: NoteTone;
  title?: ReactNode;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-control px-3.5 py-3", t.bg, className)} style={style}>
      <span className={cn("mt-px flex-none", t.glyph)}>
        <Icon name={icon ?? "info"} size={17} />
      </span>
      <div className="min-w-0">
        {title ? <div className={cn("t-note-title keep-all mb-[3px]", t.text)}>{title}</div> : null}
        <div className={cn("t-note text-pretty-keep", t.text)}>{children}</div>
      </div>
    </div>
  );
}

/**
 * 기획안에 규칙이 없는 지점 — 화면에서 규칙을 지어내는 대신 이렇게 표시한다.
 *
 * **사용자에게는 보이지 않는다.** 검토 모드(`useReviewMode`)가 켜졌을 때만 나타난다.
 * 여기 적힌 내용은 팀이 정책을 확정해야 하는 항목이므로, 정책이 확정되면
 * 이 박스를 지우고 실제 동작을 구현할 것. (핸드오프 "확정되지 않은 정책" 표 참고)
 */
export function Undecided({ children }: { children: ReactNode }) {
  const review = useReviewMode();
  if (!review) return null;
  return (
    <div
      className="mt-3 flex gap-2 rounded-xl border border-dashed border-input-border px-3 py-2.5"
      style={{
        background:
          "repeating-linear-gradient(135deg,var(--cr-100) 0 6px,var(--cr-25) 6px 12px)",
      }}
    >
      <span className="mt-px flex-none text-txt-faint">
        <Icon name="circle-dashed" size={15} />
      </span>
      <div className="text-pretty-keep font-medium text-[13px] leading-[1.55] text-ink-500">
        <b className="font-bold text-ink-600">[검토] 기획안에 규칙 없음 · 확인 필요</b> — {children}
      </div>
    </div>
  );
}
