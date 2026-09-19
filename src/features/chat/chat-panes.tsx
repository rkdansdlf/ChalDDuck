import type { ReactNode } from "react";
import { Icon } from "@/components/ui";

/**
 * 3분할에서만 보이는 기둥 / 좁은 화면에서만 보이는 기둥.
 *
 * 폭을 자바스크립트로 재지 않고 CSS 로만 나눈다 — 재면 서버 렌더에서 어느 쪽을 그릴지
 * 알 수 없어 첫 화면이 한 번 깜빡인다.
 */
export function NarrowOnly({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col lg:hidden">{children}</div>;
}

export function WideOnly({ children }: { children: ReactNode }) {
  return <div className="hidden min-h-0 flex-1 lg:flex lg:flex-col">{children}</div>;
}

/** 3분할에서 아직 대화를 고르지 않았을 때의 가운데 기둥. */
export function ChatEmptyPane() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-fill text-txt-faint">
        <Icon name="messages-square" size={24} />
      </span>
      <p className="keep-all m-0 font-semibold text-[14.5px] leading-[1.5] text-txt-muted">
        왼쪽에서 대화를 골라 주세요
      </p>
    </div>
  );
}
