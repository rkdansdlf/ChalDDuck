"use client";

import { Children, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { SURFACE, type SurfaceVariant } from "./surface";

export type PanelProps = {
  children: ReactNode;
  /** 표면 종류. 기본 `card`. */
  s?: SurfaceVariant;
  /** 안쪽 여백(px). 기본 16. */
  pad?: number;
  /** 모서리 반경(px). 기본 20 = `--r-card`. */
  r?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

export function Panel({ children, s = "card", pad = 16, r = 20, className, style, onClick }: PanelProps) {
  return (
    <div
      onClick={onClick}
      className={cn(SURFACE[s], onClick && "cursor-pointer", className)}
      style={{ borderRadius: r, padding: pad, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * 연속된 항목은 카드를 겹겹이 쌓지 않고 한 면 + 구분선으로 표현한다.
 */
export function Rows({
  children,
  s = "card",
  className,
}: {
  children: ReactNode;
  s?: SurfaceVariant;
  className?: string;
}) {
  const items = Children.toArray(children);
  return (
    <div className={cn("overflow-hidden rounded-card", SURFACE[s], className)}>
      {items.map((child, i) => (
        <div key={i} className={i ? "border-t border-line" : undefined}>
          {child}
        </div>
      ))}
    </div>
  );
}

export function SecTitle({
  children,
  note,
  action,
  onAction,
  className,
}: {
  children: ReactNode;
  note?: ReactNode;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-baseline justify-between gap-2", className)}>
      <div className="min-w-0">
        <h3 className="t-sec keep-all m-0 text-txt-strong">{children}</h3>
        {note ? <div className="t-cap-medium keep-all mt-0.5 text-txt-muted">{note}</div> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className="t-cap-strong inline-flex flex-none cursor-pointer items-center gap-0.5 border-none bg-transparent py-1.5 text-link"
        >
          {action}
          <Icon name="chevron-right" size={13} />
        </button>
      ) : null}
    </div>
  );
}
