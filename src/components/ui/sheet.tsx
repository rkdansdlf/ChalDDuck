"use client";

import { useEffect, useRef, type ReactNode } from "react";

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
  children,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        style={{ paddingBottom: "calc(26px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mt-1.5 mb-3.5 h-1 w-[38px] rounded-sm bg-cr-300" />
        {title ? <h3 className="t-h2 keep-all m-0 mb-3 text-txt-strong">{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}
