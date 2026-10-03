"use client";

import { useState } from "react";
import { Btn, Field, Icon, Input, Note, Rows, Sheet } from "@/components/ui";
import type { DeadlineHistoryItem, SubmissionBox } from "@/lib/types";
import { getDeadlineHistory, setBoxDeadline } from "@/server/actions/drive";
import { formatWhen } from "@/lib/when";

/**
 * 제출함 마감 — 보여 주고, 정하고, 바꾼다.
 *
 * 권한 규칙:
 * - 제출함 담당자 또는 팀장만 마감을 정하거나 변경할 수 있다.
 * - 마감 변경 시 변경 사유를 기록하고 이력을 조회할 수 있다.
 * - 권한이 없는 팀원에게는 안내 툴팁/노트와 함께 변경 버튼을 비활성화한다.
 *
 * 마감이 지나도 제출함은 **잠기지 않는다** — 늦게라도 내는 편이 낫고, 대신 라벨이 붙는다.
 */
export function DeadlineRow({ box }: { box: SubmissionBox }) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [value, setValue] = useState(box.dueAt ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyList, setHistoryList] = useState<DeadlineHistoryItem[]>([]);

  const canEdit = box.canEditDeadline !== false;

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const items = await getDeadlineHistory(box.id);
      setHistoryList(items);
    } catch {
      // 조회 실패 시 빈 목록 유지
    } finally {
      setHistoryLoading(false);
    }
  };

  const save = async (next: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const { ok } = await setBoxDeadline(box.id, next, reason);
      if (!ok) return setError("날짜와 시각을 모두 골라 주세요.");
      setOpen(false);
      setReason("");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
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
            <span className="t-sec keep-all flex items-center gap-2 text-txt-strong">
              {box.dueAt ? `${box.due} 마감` : box.due === "미정" ? "마감 미정" : `${box.due} 마감 · 시각 미정`}
              {box.owner ? (
                <span className="rounded-md bg-fill px-1.5 py-0.5 text-[11px] font-normal text-txt-muted">
                  담당: {box.owner}
                </span>
              ) : null}
            </span>
            <span className="t-note keep-all mt-0.5 block text-txt-muted">
              지나도 잠기지 않고 &ldquo;마감 후 제출&rdquo; 라벨만 붙습니다
            </span>
          </span>
          <div className="flex items-center gap-1.5">
            <Btn
              v="ghost"
              size="sm"
              icon="history"
              aria-label="마감 변경 이력"
              onClick={openHistory}
            >
              이력
            </Btn>
            {canEdit ? (
              <Btn
                v="outline"
                size="sm"
                onClick={() => {
                  setValue(box.dueAt ?? "");
                  setReason("");
                  setError(null);
                  setOpen(true);
                }}
              >
                {box.dueAt ? "바꾸기" : "정하기"}
              </Btn>
            ) : (
              <span
                className="inline-block cursor-not-allowed"
                title="제출함 담당자 또는 팀장만 마감을 변경할 수 있습니다"
              >
                <Btn v="outline" size="sm" disabled>
                  {box.dueAt ? "바꾸기" : "정하기"}
                </Btn>
              </span>
            )}
          </div>
        </div>
      </Rows>

      {/* 마감 설정 및 변경 Sheet */}
      <Sheet open={open} title={box.dueAt ? "마감 바꾸기" : "마감 정하기"} onClose={() => setOpen(false)}>
        <Field label="마감 시각" required hint="한국 시간 기준입니다. 이미 올라온 파일의 라벨도 새 마감에 맞춰 바뀝니다.">
          {(props) => <Input {...props} type="datetime-local" value={value} onChange={setValue} />}
        </Field>

        <Field label="변경 사유" hint="마감을 연장하거나 변경하는 사유를 입력하면 팀원들에게 함께 공유됩니다.">
          {(props) => (
            <Input
              {...props}
              placeholder="예: 발표 자료 피드백 반영을 위해 1일 연장"
              value={reason}
              onChange={setReason}
            />
          )}
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
      </Sheet>

      {/* 마감 변경 이력 Sheet */}
      <Sheet open={historyOpen} title="마감 변경 이력" onClose={() => setHistoryOpen(false)}>
        {historyLoading ? (
          <div className="py-8 text-center text-[14px] text-txt-muted">이력을 불러오는 중...</div>
        ) : historyList.length === 0 ? (
          <div className="py-8 text-center text-[14px] text-txt-muted">
            아직 마감 변경 이력이 없습니다.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {historyList.map((item) => (
              <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between text-[13.5px]">
                  <span className="font-semibold text-txt-strong">{item.changedBy}</span>
                  <span className="text-[12px] text-txt-muted">
                    {formatWhen(new Date(item.createdAt))}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[13px] text-txt">
                  <span className="line-through text-txt-muted">{item.previousDue}</span>
                  <Icon name="arrow-right" size={12} className="text-txt-muted" />
                  <span className="font-medium text-action">{item.newDue}</span>
                </div>
                {item.reason ? (
                  <div className="mt-1.5 rounded-md bg-fill px-2.5 py-1.5 text-[12.5px] text-txt-sub">
                    사유: {item.reason}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Btn full v="outline" onClick={() => setHistoryOpen(false)}>
            닫기
          </Btn>
        </div>
      </Sheet>
    </>
  );
}
