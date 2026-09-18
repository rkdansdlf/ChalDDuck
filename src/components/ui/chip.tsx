"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/**
 * 상태 라벨.
 *
 * 규칙: **색만으로 구분하지 않는다** — 항상 아이콘 + 텍스트를 함께 둔다.
 * (색각 이상·흑백 인쇄·저대비 환경에서도 상태를 읽을 수 있어야 한다)
 *
 * 글자·경계의 일부 색은 토큰에 없는 확정 실측값이라 그대로 적었다.
 */
const TONE = {
  n: "bg-fill text-ink-600 border-line",
  ok: "bg-ok-bg text-[#2F5F52] border-[#CADDD6]",
  warn: "bg-warn-bg text-[#6F5219] border-[#E8D7AE]",
  err: "bg-err-bg text-[#8A3B31] border-[#EFCEC7]",
  /** 1순위 희망 역할 */
  want: "bg-ok-bg text-[#2F5F52] border-[#CADDD6]",
  /** 피하고 싶은 역할 */
  veto: "bg-err-bg text-[#8A3B31] border-[#EFCEC7]",
  y: "bg-yellow-200 text-[#7A5E12] border-transparent",
} as const;

export type ChipTone = keyof typeof TONE;

export function Chip({
  tone = "n",
  icon,
  children,
  className,
  style,
}: {
  tone?: ChipTone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        "t-chip keep-all inline-flex max-w-full items-center gap-1 rounded-[9px] border px-[9px] py-1",
        TONE[tone],
        className,
      )}
      style={style}
    >
      {icon ? (
        <span className="flex-none self-center">
          <Icon name={icon} size={13} />
        </span>
      ) : null}
      {children}
    </span>
  );
}

/**
 * 상태 어휘 — 드라이브·파일 버전·할 일이 **모두 같은 색·아이콘**을 쓰도록 한 곳에 모은다.
 * 새 상태가 필요하면 화면에서 지어내지 말고 여기에 추가할 것.
 */
export const STATUS = {
  none: { label: "미입력", tone: "n", icon: "circle-dashed" },
  todo: { label: "할 일", tone: "n", icon: "circle" },
  waiting: { label: "대기", tone: "warn", icon: "clock" },
  doing: { label: "진행 중", tone: "y", icon: "circle-dot" },
  done: { label: "완료", tone: "ok", icon: "check" },
  late: { label: "마감 후 제출", tone: "err", icon: "alarm-clock" },
  failed: { label: "실패", tone: "err", icon: "circle-alert" },
  ready: { label: "준비 중", tone: "n", icon: "circle-dashed" },
} satisfies Record<string, { label: string; tone: ChipTone; icon: IconName }>;

export type StatusKey = keyof typeof STATUS;

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: StatusKey;
  children?: ReactNode;
  className?: string;
}) {
  const s = STATUS[status];
  return (
    <Chip tone={s.tone} icon={s.icon} className={className}>
      {children ?? s.label}
    </Chip>
  );
}
