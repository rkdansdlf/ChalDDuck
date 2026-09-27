"use client";

import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";

/**
 * 하단에서 올라오는 모달.
 *
 * 프로토타입은 단순 오버레이였지만, 실제 구현에서는 모달이 지켜야 할 것들이 있다.
 * - Esc 로 닫힌다
 * - 열리는 동안 뒤 내용이 스크롤되지 않는다
 * - 열릴 때 포커스가 시트 안으로 들어간다
 */
export function Sheet({
  open,
  title,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  /**
   * 시트 맨 아래에 붙는 동작 막대. 입력 항목이 있는 시트에는 보통 하나가 있어야 한다 —
   * 입력과 확인이 화면上下로 흩어지면 무엇을 확정하는지 애매해진다.
   */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // 부르는 쪽은 대개 `onClose` 를 매 렌더 새로 만든다. 그 값을 effect 의존성에 넣으면
  // 입력할 때마다 effect 가 다시 돌아 포커스가 시트 판으로 튀어 키보드가 꺼진다(43 커밋).
  // effect 이벤트는 늘 최신 `onClose` 를 부르면서도 effect 를 다시 돌리지 않는다.
  const closeOnEscape = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOnEscape();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-30 flex items-end"
      style={{ background: "rgba(36,28,20,.38)" }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86%] w-full overflow-y-auto rounded-t-sheet bg-card px-5 pt-2 shadow-lg outline-none"
      >
        <div className="mx-auto mt-1.5 mb-3.5 h-1 w-[38px] rounded-sm bg-cr-300" />
        {title ? <h3 className="t-h2 keep-all m-0 mb-3 text-txt-strong">{title}</h3> : null}
        {children}
        {/* 동작 막대는 시트를 아래로 스크롤해도 따라온다 — 확인 버튼이 안 보이면
            입력한 것이 그대로 버려진다. */}
        {footer ? (
          <div
            className="sticky bottom-0 -mx-5 mt-4 bg-card px-5 pt-2"
            style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        ) : (
          <div style={{ height: "calc(26px + env(safe-area-inset-bottom))" }} />
        )}
      </div>
    </div>
  );
}
