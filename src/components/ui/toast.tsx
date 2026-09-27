"use client";

/**
 * 하단 임시 알림. 탭바 바로 위(`--cd-tabbar` + 10px)에 뜬다.
 *
 * `role="status"` 라 스크린 리더가 화면 전환 없이 내용을 읽어 준다 —
 * 눈으로만 확인되는 알림은 없어야 한다.
 */
export function Toast({ msg }: { msg?: string | null }) {
  if (!msg) return null;
  return (
    <div
      role="status"
      className="animate-slide-up keep-all absolute inset-x-4 z-40 rounded-control bg-ink-800 px-4 py-3 font-semibold text-[14px] leading-[1.45] text-on-action shadow-lg"
      style={{ bottom: "calc(var(--cd-tabbar) + 10px)" }}
    >
      {msg}
    </div>
  );
}
