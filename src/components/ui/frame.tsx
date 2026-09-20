"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

/**
 * 집중 흐름(온보딩)의 프레임.
 *
 * 탭이 없는 화면들이 쓴다. 온보딩은 한 번에 한 가지만 묻는 흐름이라 넓은 화면에서도
 * 폭을 넓히지 않고 가운데 카드로 모은다 — 입력칸 하나가 1200px 로 늘어나면 읽기 어렵다.
 *
 * - 좁은 화면: 뷰포트를 꽉 채운다. `dvh` 라 주소창 높이가 바뀌어도 잘리는 곳이 없다.
 * - 넓은 화면: 420px 카드로 가운데 정렬.
 *
 * 높이를 고정하는 이유: 안쪽 `Body` 가 `flex-1` 로 스크롤 영역을 잡고 `Dock` 이 그 아래
 * 붙으려면 기준 높이가 있어야 한다.
 */
export function AppFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex min-h-dvh justify-center bg-cr-100 sm:items-center sm:p-6">
      <div
        data-screen-label={label}
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-page",
          "h-dvh",
          "sm:h-[calc(100dvh-3rem)] sm:max-h-[860px] sm:w-[420px] sm:flex-none",
          "sm:rounded-card sm:border sm:border-line sm:shadow-lg",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * 화면 맨 위의 안전 영역.
 *
 * 노치·다이나믹 아일랜드에 내용이 가리지 않도록 그만큼 자리를 비운다.
 * 그 영역에도 화면 색이 이어져야 해서 `tone` 을 받는다.
 *
 * 디자인 원본에는 9:41 목업 상태바가 있었지만 옮기지 않았다 — 실기기에서는 OS 가 그리는
 * 영역이고, 가짜 시계를 그리면 44px 을 버리면서 틀린 시각을 보여 주게 된다.
 */
export function TopInset({ tone }: { tone?: "y" }) {
  return (
    <div
      aria-hidden="true"
      className={cn("h-[env(safe-area-inset-top)] flex-none", tone === "y" && "bg-yellow-100")}
    />
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
  /**
   * 아이콘 위에 얹는 건수.
   *
   * 색 점 대신 숫자를 쓴다 — 상태를 색만으로 구분하지 않는다는 규칙과 같은 이유이고,
   * "몇 건인지"가 "있다/없다"보다 행동을 정하는 데 쓸모 있다. 읽는 이름(`actionLabel`)에도
   * 건수를 담아야 화면을 못 보는 사람도 같은 것을 안다.
   */
  actionBadge?: number;
  onAction?: () => void;
  tone?: "y";
  /**
   * 넓은 화면에서 뒤로가기를 숨긴다.
   *
   * 3분할처럼 돌아갈 목록이 이미 옆에 보이는 화면에서 쓴다 — 보이는 곳으로 "돌아가는"
   * 버튼은 무엇이 일어날지 알 수 없다.
   */
  hideBackOnWide?: boolean;
};

export function AppBar({
  title,
  sub,
  onBack,
  action,
  actionLabel,
  actionBadge,
  onAction,
  tone,
  hideBackOnWide,
}: AppBarProps) {
  return (
    <div
      className={cn(
        "flex min-h-[52px] flex-none items-center gap-1 pr-1.5 backdrop-blur-md",
        onBack ? "pl-0.5" : "pl-[18px]",
        onBack && hideBackOnWide && "lg:pl-[18px]",
        tone === "y" ? "bg-yellow-100 border-b border-transparent" : "border-b border-line",
      )}
      style={tone === "y" ? undefined : { background: "rgba(255,253,249,.94)" }}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="뒤로"
          className={cn(
            "grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt",
            hideBackOnWide && "lg:hidden",
          )}
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
          className="relative grid size-11 flex-none cursor-pointer place-items-center rounded-xl border-none bg-transparent text-txt"
        >
          <Icon name={action} size={20} />
          {actionBadge ? (
            // 탭바 배지와 같은 규격을 쓴다 — 같은 뜻의 표시가 화면마다 달라 보이면 안 된다.
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 box-border h-[17px] min-w-[17px] rounded-full bg-coral-400 px-1 text-center font-bold text-[11px] leading-[17px] text-ink-900"
            >
              {actionBadge > 9 ? "9+" : actionBadge}
            </span>
          ) : null}
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
