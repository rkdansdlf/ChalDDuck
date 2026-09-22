"use client";

import type { ReactNode } from "react";
import { Btn } from "./button";
import { Icon } from "./icon";

/**
 * 화면이 열리지 못했을 때 보여 주는 자리.
 *
 * `app/error.tsx` 와 `app/(tabs)/error.tsx`, 그리고 없는 주소(`not-found.tsx`)가 같이 쓴다.
 * 세 곳이 각자 만들면 같은 사고가 화면마다 다르게 보인다.
 *
 * 두 가지를 지킨다.
 *
 * - **무슨 일이 일어났는지 숨기지 않는다.** 다만 서버가 만든 오류 문구를 그대로 내보이지는
 *   않는다 — 운영에서는 Next 가 그 문구를 지우고 `digest` 만 남기고, 그 편이 맞다.
 *   내부 사정(표 이름·주소)이 그대로 보이면 사용자에게 도움이 되지 않는다.
 * - **나갈 길을 항상 둔다.** 다시 해 볼 수 있으면 `onRetry`, 아니면 처음으로.
 *   이 화면에서 막히면 앱 전체가 막힌 것처럼 느껴진다.
 */
export function Failure({
  title,
  children,
  onRetry,
  onHome,
  /** Next 가 붙이는 오류 식별자. 물어볼 때 쓰라고 작게 보여 준다. */
  digest,
}: {
  title: string;
  children: ReactNode;
  onRetry?: () => void;
  onHome: () => void;
  digest?: string;
}) {
  return (
    <div className="flex flex-col items-center px-5 pt-14 text-center">
      <span className="mb-4 grid size-14 place-items-center rounded-full bg-fill text-txt-muted">
        <Icon name="circle-alert" size={26} />
      </span>

      <h1 className="t-h1 keep-all text-txt-strong">{title}</h1>
      <p className="text-pretty-keep t-body mt-2.5 max-w-[34ch] text-txt-muted">{children}</p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Btn icon="rotate-ccw" onClick={onRetry}>
            다시 시도
          </Btn>
        ) : null}
        <Btn v={onRetry ? "ghost" : "primary"} onClick={onHome}>
          처음으로
        </Btn>
      </div>

      {digest ? <p className="t-cap mt-6 text-txt-faint">오류 번호 {digest}</p> : null}
    </div>
  );
}
