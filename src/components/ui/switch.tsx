"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * 켜고 끄는 한 줄.
 *
 * **누르는 면은 44px 이상**이어야 하고(엄지), 상태는 **색만이 아니라 위치와 낱말**로도
 * 읽혀야 한다(색각 이상·흑백 인쇄). `stateText` 는 켜짐/꺼짐을 말로 보이는 자리다 —
 * 스위치 그림만으로는 확실하지 않다.
 */
export function Switch({
  checked,
  onChange,
  label,
  stateText,
  icon,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  /** 켜짐·꺼짐을 읽히는 말. 색으로만 알리지 않는다. */
  stateText?: string;
  icon?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-11 w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-0 py-2 text-left",
        disabled && "cursor-default opacity-60",
        className,
      )}
    >
      {icon ? <span className="flex-none text-txt-muted">{icon}</span> : null}

      <span className="min-w-0 flex-1">
        <span className="t-label block text-txt-strong">{label}</span>
        {stateText ? (
          <span className="t-cap block text-txt-muted" aria-hidden="true">
            {stateText}
          </span>
        ) : null}
      </span>

      {/* 켜졌을 때만 노브가 옮겨 간다 — 모양과 움직임이 함께 말한다. */}
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[26px] w-[46px] flex-none items-center rounded-full border transition-colors duration-150",
          checked ? "border-transparent bg-action" : "border-line bg-fill",
        )}
      >
        <span
          className={cn(
            "size-[20px] rounded-full bg-white shadow-2xs transition-transform duration-150",
            checked ? "translate-x-[24px]" : "translate-x-[2px]",
          )}
        />
      </span>
    </button>
  );
}
