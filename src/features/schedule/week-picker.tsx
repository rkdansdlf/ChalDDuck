"use client";

import { cn } from "@/lib/cn";
import type { ScheduleWeek } from "@/lib/types";

/**
 * 격자에 보여 줄 주 고르기 — 내 시간표와 팀 겹쳐보기가 같은 모양으로 쓴다.
 *
 * 무엇을 칠할지(노란 선택)가 아니라 **어디를 볼지**를 고르는 것이라 어두운 톤으로 나눈다.
 */
export function WeekPicker({
  weeks,
  value,
  onChange,
}: {
  weeks: ScheduleWeek[];
  value: string;
  onChange: (week: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="보는 주" className="mb-3 flex gap-[5px]">
      {weeks.map((w) => {
        const on = w.key === value;
        return (
          <button
            key={w.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(w.key)}
            className={cn(
              "min-h-11 flex-1 cursor-pointer rounded-[10px] border-none px-2 font-bold text-[13px] leading-tight",
              on ? "bg-action text-on-action" : "bg-fill text-txt",
            )}
          >
            {w.name}
            <span
              className={cn(
                "ml-1 font-mono font-medium text-[11.5px]",
                on ? "text-on-action" : "text-txt-muted",
              )}
            >
              {w.range}
            </span>
          </button>
        );
      })}
    </div>
  );
}
