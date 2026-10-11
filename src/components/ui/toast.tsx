"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * 하단 임시 알림. 하단 바(`--cd-tabbar`, 탭바·입력줄) 위에 뜨고, 흐름 안의 `Dock` 이 있으면
 * 그 높이(`--cd-dock-h`)만큼 더 올라간다. 바가 없는 화면에서는 화면 아래에서 10px 위에 뜬다.
 *
 * `role="status"` 라 스크린 리더가 화면 전환 없이 내용을 읽어 준다 —
 * 눈으로만 확인되는 알림은 없어야 한다.
 * 사라질 때도 뚝 끊기지 않고 부드럽게 아래로 내려가며 페이드아웃된다.
 */
export function Toast({ msg }: { msg?: string | null }) {
  const [current, setCurrent] = useState<string | null>(msg ?? null);
  const [prevMsg, setPrevMsg] = useState(msg);

  if (msg !== prevMsg) {
    setPrevMsg(msg);
    if (msg) {
      setCurrent(msg);
    }
  }

  const closing = Boolean(current && !msg);

  if (!current) return null;

  return (
    <div
      role="status"
      onAnimationEnd={() => {
        if (closing) setCurrent(null);
      }}
      className={cn(
        "keep-all absolute inset-x-4 z-40 rounded-control bg-ink-800 px-4 py-3 font-semibold text-[14px] leading-[1.45] text-on-action shadow-lg",
        closing ? "animate-slide-down animate-fade-out" : "animate-slide-up",
      )}
      style={{ bottom: "calc(var(--cd-tabbar) + var(--cd-dock-h, 0px) + 10px)" }}
    >
      {current}
    </div>
  );
}
