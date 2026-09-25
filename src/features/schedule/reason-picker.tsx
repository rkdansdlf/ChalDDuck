"use client";

import { useId, useState, type FormEvent } from "react";
import { Btn, Icon, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { BusyKind } from "@/lib/types";
import { BUSY_LABEL_MAX, normalizeBusyLabel } from "./busy-blocks";
import { lookOf, sameReason, type Reason } from "./reason";

/** 직접 입력할 때 눌러서 바로 쓰는 예시. 입력의 수고를 덜려는 것이지 목록을 정해 두는 것이 아니다. */
const EXAMPLES = ["동아리", "통학", "병원", "스터디", "가족 일정"];

/**
 * 사유 고르기 — 기본 사유 세 개, 내가 만든 사유들, 그리고 `＋ 직접 입력`.
 *
 * 직접 입력은 시트가 아니라 **이 자리에서 펼친다.** 블록 편집 시트 안에서도 쓰이는데,
 * 시트 위에 시트를 또 띄우면 닫을 때 어디로 돌아가는지 헷갈린다.
 */
export function ReasonPicker({
  kinds,
  customKind,
  labels,
  value,
  onChange,
  className,
}: {
  kinds: BusyKind[];
  customKind: BusyKind;
  /** 내가 만든 사유 이름들. */
  labels: string[];
  value: Reason;
  /** 고르거나 새로 만든 사유. 새로 만든 이름은 부르는 쪽이 `labels` 에 더한다. */
  onChange: (reason: Reason) => void;
  className?: string;
}) {
  const inputId = useId();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const options: Reason[] = [
    ...kinds.map((k) => ({ kind: k.key, label: null })),
    ...labels.map((label) => ({ kind: "custom" as const, label })),
  ];

  const create = (raw: string) => {
    const label = normalizeBusyLabel(raw);
    if (!label) return;
    onChange({ kind: "custom", label });
    setDraft("");
    setAdding(false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create(draft);
  };

  const valid = normalizeBusyLabel(draft) !== null;

  return (
    <div className={className}>
      <div role="radiogroup" aria-label="안 되는 이유" className="flex gap-1.5 overflow-x-auto pb-0.5">
        {options.map((reason) => {
          const look = lookOf(reason, kinds, customKind);
          const on = sameReason(value, reason);
          return (
            <button
              key={reason.kind === "custom" ? `custom:${reason.label}` : reason.kind}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(reason)}
              className={cn(
                "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl px-[13px] font-bold text-[13.5px] leading-none",
                on
                  ? "border border-transparent bg-action text-on-action"
                  : "border border-line bg-card text-txt",
              )}
            >
              <span
                className="size-[9px] flex-none rounded-[3px]"
                style={{ background: on ? "var(--y-400)" : look.swatch }}
              />
              {look.name}
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={adding}
          aria-controls={`${inputId}-panel`}
          onClick={() => setAdding((v) => !v)}
          className="inline-flex min-h-11 flex-none cursor-pointer items-center gap-1 whitespace-nowrap rounded-xl border border-line border-dashed bg-transparent px-[13px] font-bold text-[13.5px] leading-none text-txt-muted"
        >
          <Icon name={adding ? "x" : "plus"} size={14} />
          {adding ? "닫기" : "직접 입력"}
        </button>
      </div>

      {adding ? (
        <form id={`${inputId}-panel`} onSubmit={submit} className="mt-2.5">
          <label htmlFor={inputId} className="t-cap-strong mb-1.5 block text-txt-muted">
            사유 이름 (최대 {BUSY_LABEL_MAX}자 · 나에게만 보입니다)
          </label>
          <div className="flex gap-1.5">
            <Input
              id={inputId}
              value={draft}
              onChange={setDraft}
              placeholder="예: 동아리"
              maxLength={BUSY_LABEL_MAX}
              autoFocus
            />
            <Btn type="submit" v="soft" disabled={!valid} className="flex-none">
              만들기
            </Btn>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.filter((ex) => !labels.includes(ex)).map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => create(ex)}
                className="t-cap-strong min-h-9 cursor-pointer rounded-full border-none bg-fill px-3 text-txt"
              >
                {ex}
              </button>
            ))}
          </div>
        </form>
      ) : null}
    </div>
  );
}
