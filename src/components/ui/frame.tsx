"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/**
 * 앱 프레임.
 *
 * 프로토타입은 모든 화면을 390×812 고정 프레임(`Phone`)에 넣었지만, 실제 서비스는
 * 브라우저에서 돌아가므로 그대로 옮길 수 없다. 그래서 같은 컴포넌트를 반응형으로 옮겼다.
 * - 좁은 화면(모바일 실기기): 뷰포트를 꽉 채운다. `100dvh` 라 주소창 높이 변화에도 잘린 곳이 없다.
 * - 넓은 화면(개발·리뷰용 데스크톱): 디자인 원본과 같은 390×812 기기 프레임을 가운데에 띄운다.
 *
 * 33번(PC 3분할) 같은 데스크톱 전용 레이아웃은 아직 범위 밖이라, 지금은 넓은 화면에서도
 * 모바일 레이아웃을 그대로 보여준다.
 */
export function AppFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex min-h-dvh justify-center bg-cr-100 sm:items-center sm:p-6">
      <div
        data-screen-label={label}
        className={cn(
          "cd-frame relative flex w-full flex-col overflow-hidden bg-page",
          "h-dvh",
          "sm:h-[812px] sm:max-h-full sm:w-[390px] sm:flex-none",
          "sm:rounded-phone sm:border sm:border-line-strong sm:shadow-lg",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 상태바 — 디자인 원본의 9:41 목업.
 *
 * 실기기에서는 OS가 그리는 영역이라 화면에 그릴 필요가 없다. 대신 노치/다이나믹 아일랜드를
 * 피하도록 safe-area 만큼 자리를 잡아 준다. 데스크톱 프레임에서만 목업 상태바를 보여
 * 디자인 시안과 나란히 놓고 비교할 수 있게 한다.
 */
export function StatusBar({ tone }: { tone?: "y" | "ink" }) {
  return (
    <div
      className={cn(
        "flex min-h-11 flex-none items-center justify-between px-5 pt-[env(safe-area-inset-top)]",
        "font-semibold text-[13px] leading-none",
        tone === "y" && "bg-yellow-100",
        tone === "ink" ? "bg-ink-700 text-on-action" : "text-txt-strong",
      )}
    >
      <span aria-hidden="true">9:41</span>
      <span className="flex items-center gap-[5px] opacity-80" aria-hidden="true">
        <Icon name="signal" size={13} />
        <Icon name="wifi" size={13} />
        <Icon name="battery-full" size={15} />
      </span>
    </div>
  );
}

export type AppBarProps = {
  /** 화면의 목적만 적는다. 진행 단계 같은 부가 정보는 `sub` 로. */
  title: string;
  sub?: string;
  onBack?: () => void;
  /** 우측 아이콘 버튼 — 아이콘 이름이 곧 접근성 라벨이 되지 않도록 `actionLabel` 을 함께 준다. */
  action?: IconName;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "y";
};

export function AppBar({ title, sub, onBack, action, actionLabel, onAction, tone }: AppBarProps) {
  return (
    <div
      className={cn(
        "flex min-h-[52px] flex-none items-center gap-1 pr-1.5 backdrop-blur-md",
        onBack ? "pl-0.5" : "pl-[18px]",
        tone === "y" ? "bg-yellow-100 border-b border-transparent" : "border-b border-line",
      )}
      style={tone === "y" ? undefined : { background: "rgba(255,253,249,.94)" }}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt"
        >
          <Icon name="chevron-left" size={22} />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="t-bar keep-all text-txt-strong">{title}</div>
        {sub ? <div className="font-medium text-[13px] leading-[1.35] text-txt-muted">{sub}</div> : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          aria-label={actionLabel ?? action}
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt"
        >
          <Icon name={action} size={20} />
        </button>
      ) : null}
    </div>
  );
}

export type BodyProps = {
  children: ReactNode;
  /** 목록·시간표처럼 항목이 촘촘한 화면(좌우 16px). 기본은 소개·입력 화면(좌우 20px). */
  dense?: boolean;
  tone?: "y";
  /**
   * 본문 아래 여백. 탭바가 있는 화면은 탭바 높이(약 88px)를 넘겨야 마지막 항목이 가려지지 않는다.
   * `Dock` 은 흐름 안에 있어서 따로 자리를 비워 줄 필요가 없다.
   */
  pad?: number;
  className?: string;
};

export function Body({ children, dense, tone, pad = 24, className }: BodyProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
        dense ? "px-4 pt-3" : "px-5 pt-4",
        tone === "y" && "bg-yellow-100",
        className,
      )}
      style={{ paddingBottom: pad }}
    >
      {children}
    </div>
  );
}

/**
 * 하단 고정 행동 바(주요 CTA).
 *
 * 디자인 원본은 이 바를 `position:absolute` 로 띄웠는데, 그러면 본문 마지막 내용이 바 뒤로
 * 들어가 버린다(실제로 01 화면의 "초대받은 팀" 카드가 프로토타입에서 통째로 가려져 있었다).
 * 여기서는 **흐름 안의 형제 요소**로 두어 `Body` 가 알아서 줄어들게 했다 —
 * 화면마다 여백 숫자를 맞춰 넣지 않아도 무엇도 가려지지 않는다.
 *
 * `above` 를 주면(탭바 위에 겹쳐야 하는 화면) 예전처럼 띄운다.
 */
export function Dock({ children, above }: { children: ReactNode; above?: number }) {
  const floating = above !== undefined;
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-line px-4 pt-3 backdrop-blur-md",
        floating ? "absolute inset-x-0" : "flex-none",
      )}
      style={{
        bottom: above,
        paddingBottom: floating ? 12 : "calc(22px + env(safe-area-inset-bottom))",
        background: "rgba(255,253,249,.96)",
      }}
    >
      {children}
    </div>
  );
}
