"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

/**
 * 라벨 + 입력창 + 도움말/오류.
 *
 * `required` 가 아니면 라벨 옆에 "· 선택" 을 붙인다 — 별표(*)는 무슨 뜻인지
 * 설명 없이는 읽히지 않으므로 쓰지 않는다.
 *
 * `children` 은 `id`/`aria-*` 를 받는 렌더 함수다. 라벨-입력창-오류 연결을
 * 화면 코드가 직접 챙기지 않아도 되게 하기 위한 것.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const messageId = `${id}-msg`;
  const hasMessage = Boolean(error ?? hint);

  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="t-label mb-1.5 block text-txt-strong">
        {label}
        {required ? null : <span className="font-medium text-txt-muted"> · 선택</span>}
      </label>

      {children({
        id,
        "aria-describedby": hasMessage ? messageId : undefined,
        "aria-invalid": error ? true : undefined,
      })}

      {error ? (
        <div id={messageId} role="alert" className="mt-[7px] flex items-start gap-1.5">
          <span className="mt-px flex-none text-err">
            <Icon name="circle-alert" size={15} />
          </span>
          <span className="t-cap-strong keep-all text-err">{error}</span>
        </div>
      ) : hint ? (
        <div id={messageId} className="t-cap text-pretty-keep mt-1.5 text-txt-muted">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export type InputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  /** 초대 코드처럼 글자 폭이 일정해야 읽기 좋은 값. */
  mono?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function Input({ value, onChange, error, mono, className, ...rest }: InputProps & { className?: string }) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "t-input box-border min-h-[52px] w-full rounded-control border-[1.5px] bg-card px-3.5 text-txt-strong outline-none",
        error ? "border-err" : "border-input-border",
        mono && "font-mono",
        className,
      )}
    />
  );
}
