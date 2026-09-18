"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/**
 * 버튼 종류.
 * 규칙: **채운 버튼(primary/yellow)은 한 화면에 하나**. 비활성은 투명도가 아니라
 * 전용 팔레트(`off`)로 — 투명도로 흐리면 대비가 예측 불가능해진다.
 */
const VARIANT = {
  primary: "bg-action text-on-action border border-transparent",
  yellow: "bg-yellow-400 text-ink-900 border border-transparent",
  outline: "bg-card text-txt-strong border border-line-strong",
  soft: "bg-fill text-txt-strong border border-transparent",
  ghost: "bg-transparent text-link border border-transparent",
  off: "bg-fill text-txt-disabled border border-line",
} as const;

export type ButtonVariant = Exclude<keyof typeof VARIANT, "off">;
export type ButtonSize = "sm" | "md" | "lg";

export type BtnProps = {
  children: ReactNode;
  v?: ButtonVariant;
  /** lg=52px, md=44px(기본). sm 은 44px 미만이므로 보조 동작에만 쓴다. */
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  full?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

export function Btn({
  children,
  v = "primary",
  size = "md",
  icon,
  iconRight,
  full,
  disabled,
  type = "button",
  onClick,
  className,
  style,
}: BtnProps) {
  const glyph = size === "sm" ? 15 : 17;
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-[7px] rounded-control",
        "keep-all",
        size === "lg" ? "min-h-[52px]" : "min-h-11",
        size === "sm" ? "px-[13px] py-2 t-btn-sm" : "px-[17px] py-[9px] t-btn",
        full ? "w-full" : "w-auto",
        disabled ? "cursor-default" : "cursor-pointer",
        disabled ? VARIANT.off : VARIANT[v],
        className,
      )}
      style={style}
    >
      {icon ? <Icon name={icon} size={glyph} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={glyph} /> : null}
    </button>
  );
}
