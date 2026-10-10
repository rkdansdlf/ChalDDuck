"use client";

import { cn } from "@/lib/cn";
import type { CushionTone } from "@/lib/types";

/**
 * 칩 한 줄 — 말투(15·읽기 도움)와 **읽기 강도** 가 함께 쓴다.
 *
 * **보낼 때(15 쿠션 번역기)와 받을 때(읽기 도움)가 같은 칩을 쓴다.** 두 곳에 따로 만들면
 * "부드럽게" 라는 말이 한 화면에서는 다르게 읽히고, 사용자는 같은 뜻인 줄 알면서 서로
 * 다른 기능을 쓰는 셈이 된다.
 *
 * 라벨·`role` 규칙은 두 화면이 같다: `radiogroup` 안에 `radio` 다. 하나만 골라지는 값이
 * 라서 체크박스 집합이 아니다.
 */
export function TonePicker({
  tones,
  value,
  onChange,
  label,
  className,
}: {
  tones: CushionTone[];
  value: string;
  onChange: (key: string) => void;
  /** 스크린리더가 읽는 묶음 이름. 화면마다 다르다("말투 고르기" / "읽는 말투"). */
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1.5 overflow-x-auto", className)}>
      {tones.map((item) => {
        const on = value === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(item.key)}
            className={cn(
              "min-h-11 flex-none cursor-pointer whitespace-nowrap rounded-xl px-3.5 font-bold text-[13.5px] leading-none transition-all duration-150 select-none active:scale-95",
              on
                ? "border border-transparent bg-action text-on-action shadow-2xs"
                : "border border-line/60 bg-card/60 text-txt-muted hover:border-line hover:bg-card hover:text-txt",
            )}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
