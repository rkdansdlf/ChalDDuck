"use client";

import { useState } from "react";
import { Btn, Field, Icon, Input, Note, Rows, Sheet, Undecided } from "@/components/ui";
import type { SubmissionBox } from "@/lib/types";
import { setBoxDeadline } from "@/server/actions/drive";

/**
 * 제출함 마감 — 보여 주고, 정하고, 바꾼다.
 *
 * 예전에는 마감을 정할 곳이 없어서 새로 만든 팀의 제출함은 영원히 "미정"이었고,
 * 그래서 "마감 후 제출" 라벨도 붙을 수가 없었다.
 *
 * 마감이 지나도 제출함은 **잠기지 않는다** — 늦게라도 내는 편이 낫고, 대신 라벨이 붙는다.
 */
export function DeadlineRow({ box }: { box: SubmissionBox }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(box.dueAt ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const { ok } = await setBoxDeadline(box.id, next);
      if (!ok) return setError("날짜와 시각을 모두 골라 주세요.");
      setOpen(false);
    } catch {
      setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Rows className="mb-3.5">
        <div className="flex min-h-[56px] items-center gap-3 px-[15px] py-3">
          <span className="grid size-[38px] flex-none place-items-center rounded-xl bg-fill text-txt-muted">
            <Icon name="calendar-clock" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-sec keep-all block text-txt-strong">
              {/* 시각으로 옮기지 못한 옛 문자열("다음 주")은 그대로 보이고, 라벨 계산에는 쓰지 않는다. */}
              {box.dueAt ? `${box.due} 마감` : box.due === "미정" ? "마감 미정" : `${box.due} 마감 · 시각 미정`}
            </span>
            <span className="t-note keep-all mt-0.5 block text-txt-muted">
              지나도 잠기지 않고 &ldquo;마감 후 제출&rdquo; 라벨만 붙습니다
            </span>
          </span>
          <Btn
            v="outline"
            size="sm"
            onClick={() => {
              setValue(box.dueAt ?? "");
              setError(null);
              setOpen(true);
            }}
          >
            {box.dueAt ? "바꾸기" : "정하기"}
          </Btn>
        </div>
      </Rows>

      <Sheet open={open} title={box.dueAt ? "마감 바꾸기" : "마감 정하기"} onClose={() => setOpen(false)}>
        <Field label="마감 시각" required hint="한국 시간 기준입니다. 이미 올라온 파일의 라벨도 새 마감에 맞춰 바뀝니다.">
          {(props) => <Input {...props} type="datetime-local" value={value} onChange={setValue} />}
        </Field>

        {error ? (
          <Note tone="warn" icon="circle-alert" className="mb-3">
            {error}
          </Note>
        ) : null}

        <div className="flex gap-2">
          <Btn full v="outline" disabled={saving} onClick={() => setOpen(false)}>
            취소
          </Btn>
          <Btn full disabled={saving || !value} onClick={() => save(value)}>
            {saving ? "저장하는 중" : "저장"}
          </Btn>
        </div>

        {box.dueAt ? (
          <Btn full v="ghost" icon="x" className="mt-2" disabled={saving} onClick={() => save(null)}>
            마감 없애기
          </Btn>
        ) : null}

        <Undecided>
          마감을 누가 정할 수 있는지가 기획안에 없어 팀원 누구나 바꿀 수 있게 열어뒀습니다.
        </Undecided>
      </Sheet>
    </>
  );
}
