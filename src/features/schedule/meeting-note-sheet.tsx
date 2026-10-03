"use client";

import { useEffect, useState } from "react";
import { Btn, Chip, Icon, Panel, Sheet } from "@/components/ui";
import { getMeetingNoteByProposalAction } from "@/server/actions/notes";
import type { MeetingNote } from "@/lib/types";

export function MeetingNoteSheet({
  open,
  meetingId,
  title,
  onClose,
}: {
  open: boolean;
  meetingId: string | null;
  title?: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState<MeetingNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!open || !meetingId) {
      setNote(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setShowRaw(false);

    getMeetingNoteByProposalAction(meetingId)
      .then((res) => {
        if (!cancelled) setNote(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, meetingId]);

  return (
    <Sheet
      open={open}
      title={title || "회의록 아카이브"}
      onClose={onClose}
      footer={
        <Btn full size="lg" v="outline" onClick={onClose}>
          닫기
        </Btn>
      }
    >
      {loading ? (
        <div className="py-12 text-center">
          <div className="animate-spin inline-block size-6 border-2 border-brand border-t-transparent rounded-full mb-2" />
          <p className="t-body text-txt-muted">회의록을 불러오는 중…</p>
        </div>
      ) : !note ? (
        <div className="py-10 text-center">
          <Icon name="file-text" size={32} className="mx-auto text-txt-muted mb-2 opacity-50" />
          <p className="t-body font-bold text-txt-strong">저장된 회의록이 없습니다</p>
          <p className="t-cap text-txt-muted mt-1">
            AI 서기를 통해 회의 요약 및 할 일을 등록하면 여기에 아카이브됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex items-center gap-1.5">
              <Chip tone="ok">
                액션 아이템 {note.taskCount}건 등록됨
              </Chip>
              {note.createdByName && (
                <span className="text-[12px] text-txt-muted">
                  기록: {note.createdByName}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowRaw(!showRaw)}
              className="text-[12px] font-semibold text-action underline cursor-pointer"
            >
              {showRaw ? "요약본 보기" : "원문 메모 보기"}
            </button>
          </div>

          {showRaw ? (
            <div>
              <div className="t-label mb-1.5 text-txt-strong">원문 회의 메모</div>
              <Panel s="fill" pad={14} r={14}>
                <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-txt-muted">
                  {note.rawText}
                </pre>
              </Panel>
            </div>
          ) : (
            <div>
              <div className="t-label mb-1.5 text-txt-strong">AI 구조화 회의 요약</div>
              <Panel s="coral" pad={14} r={14}>
                <div className="whitespace-pre-wrap text-pretty-keep text-[14px] leading-relaxed text-[#8A3B29]">
                  {note.summary}
                </div>
              </Panel>
            </div>
          )}

          <div className="text-[11.5px] text-txt-muted text-right">
            보관 일시: {new Date(note.createdAt).toLocaleDateString("ko-KR")}
          </div>
        </div>
      )}
    </Sheet>
  );
}
