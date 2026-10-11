"use client";

import { Fragment, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * 글자 한 개씩 칸에 나눠 보여 주는 코드 입력 — 네 칸씩 세 덩이(예: ABCD-EFGH-JKLM).
 *
 * 실제 입력은 **투명한 input 하나**가 받는다. 칸(div)을 눌러 포커스를 옮기면 휴대폰에서
 * 키보드가 올라오지 않으므로, input 이 칸 위를 덮고 탭을 직접 받게 한다.
 *
 * 붙여넣기로 하이픈이 섞여 들어와도 여기서 걸러 낸다 — 서버도 같은 규칙으로 읽는다
 * (`normalizeRejoinCode`: 대소문자와 하이픈을 무시한다).
 */

const GROUP = 4;

/** 대문자·숫자만 남기고 길이를 자른다. */
export function sanitizeCode(input: string, length: number): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, length);
}

export function CodeCells({
  value,
  onChange,
  length = 12,
  error = false,
  errorKey = 0,
  label,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: boolean;
  /** 오류가 날 때마다 바꾼다 — 같은 오류여도 흔들림이 다시 나도록. */
  errorKey?: number;
  label: string;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const groups = length / GROUP;

  return (
    <div className="relative">
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(sanitizeCode(e.target.value, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-invalid={error || undefined}
        className="absolute inset-0 z-10 size-full cursor-text opacity-0"
      />

      <div
        key={errorKey}
        aria-hidden="true"
        className={cn("flex items-center justify-center gap-2", error && "animate-shake")}
      >
        {Array.from({ length: groups }, (_, g) => (
          <Fragment key={g}>
            {g > 0 ? <span className="h-0.5 w-1.5 flex-none rounded-sm bg-cr-300" /> : null}
            <div className="flex gap-1">
              {Array.from({ length: GROUP }, (_, k) => {
                const i = g * GROUP + k;
                const has = i < value.length;
                const current = focused && !error && i === value.length;
                return (
                  <div
                    key={i}
                    className={cn(
                      "grid h-[46px] w-[21px] place-items-center rounded-[9px] border-[1.5px] font-mono text-[17px] leading-none font-bold text-txt-strong transition-[border-color,background,transform,box-shadow] duration-200",
                      error
                        ? "border-err bg-err-bg"
                        : has
                          ? "border-yellow-300 bg-yellow-100"
                          : "border-input-border bg-card",
                      current && "-translate-y-0.5 border-yellow-500 ring-3 ring-yellow-400/30",
                    )}
                  >
                    {has ? (
                      <span key={`${i}-${value[i]}`} className="animate-pop">
                        {value[i]}
                      </span>
                    ) : current ? (
                      <span className="h-5 w-0.5 animate-caret bg-txt-strong" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
