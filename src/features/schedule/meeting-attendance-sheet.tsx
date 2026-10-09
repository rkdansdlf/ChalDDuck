"use client";

import { useEffect, useState } from "react";
import { Btn, Icon, Sheet, Toast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useAction } from "@/lib/use-action";
import {
  getMeetingAttendance,
  saveMeetingAttendance,
  type MeetingAttendanceInfo,
} from "@/server/actions/attendance";

export function MeetingAttendanceSheet({
  open,
  meetingId,
  meetingTitle,
  onClose,
  onSaved,
}: {
  open: boolean;
  meetingId: string | null;
  meetingTitle?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [info, setInfo] = useState<MeetingAttendanceInfo | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { toast, busy, flash, run } = useAction();
  const saving = busy.save === true;

  const handleClose = () => {
    setInfo(null);
    setSelectedIds(new Set());
    onClose();
  };

  useEffect(() => {
    if (!open || !meetingId) {
      return;
    }

    let cancelled = false;

    getMeetingAttendance(meetingId)
      .then((res) => {
        if (cancelled) return;
        setInfo(res);

        // 이미 출석 체크된 기록이 있는지 확인
        const attendedMembers = res.attendees.filter((a) => a.attended).map((a) => a.memberId);

        if (attendedMembers.length > 0) {
          // 기존에 저장된 출석이 있으면 그대로 복원
          setSelectedIds(new Set(attendedMembers));
        } else {
          // 아직 한 번도 출석 체크를 안 했다면, 제안에 동의했던 사람들을 기본 선택 추천
          const agreedMembers = res.attendees.filter((a) => a.agreed).map((a) => a.memberId);
          setSelectedIds(new Set(agreedMembers));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          flash(err.message || "출석 정보를 불러오지 못했습니다.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, meetingId, flash]);

  const toggleMember = (id: string) => {
    if (!info?.canEdit) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (!info?.canEdit) return;
    if (!info) return;
    setSelectedIds(new Set(info.attendees.map((a) => a.memberId)));
  };

  const handleSave = () => {
    if (!meetingId || !info?.canEdit) return;

    run(
      "save",
      async () => {
        const res = await saveMeetingAttendance(meetingId, Array.from(selectedIds));
        onSaved?.();
        handleClose();
        return `참석자 ${res.count}명의 출석과 기여 기록이 저장되었습니다.`;
      },
      "출석 정보를 저장하지 못했습니다.",
    );
  };

  return (
    <>
      <Sheet
        open={open}
        title={meetingTitle || "회의 참석 확인"}
        onClose={handleClose}
        footer={
        info?.canEdit ? (
          <div className="flex w-full gap-2">
            <Btn size="lg" v="outline" className="flex-1" onClick={handleClose} disabled={saving}>
              취소
            </Btn>
            <Btn
              size="lg"
              v="yellow"
              className="flex-1"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "저장 중..." : `출석 확인 저장 (${selectedIds.size}명)`}
            </Btn>
          </div>
        ) : (
          <Btn full size="lg" v="outline" onClick={handleClose}>
            닫기
          </Btn>
        )
      }
    >
      {!info ? (
        <div className="py-12 text-center text-[13px] text-txt-muted">
          출석 명단을 불러오는 중...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-control bg-fill/50 p-3 text-[13px] leading-relaxed text-txt-muted">
            {info.canEdit ? (
              <>
                실제 회의에 참석한 팀원을 선택해 주세요.
                <br />
                확인된 인원은 <b>기여 기록(회의 참석)에 자동으로 반영</b>됩니다.
              </>
            ) : (
              <>팀장이 확인한 실제 회의 참석자 명단입니다.</>
            )}
          </div>

          {info.canEdit ? (
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="font-semibold text-txt-strong">
                참석자 선택 ({selectedIds.size}/{info.attendees.length}명)
              </span>
              <button
                type="button"
                onClick={selectAll}
                className="cursor-pointer text-ink-900 underline underline-offset-2 hover:opacity-80"
              >
                전원 선택
              </button>
            </div>
          ) : null}

          <div className="space-y-2">
            {info.attendees.map((attendee) => {
              const isSelected = selectedIds.has(attendee.memberId);

              return (
                <div
                  key={attendee.memberId}
                  onClick={() => toggleMember(attendee.memberId)}
                  className={cn(
                    "flex items-center justify-between rounded-control border p-3 transition-colors",
                    info.canEdit ? "cursor-pointer hover:bg-card/80" : "",
                    isSelected
                      ? "border-emerald-300 bg-emerald-50/50"
                      : "border-line bg-card",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-7.5 place-items-center rounded-full bg-yellow-100 text-[12px] font-bold text-yellow-800">
                      {attendee.name.charAt(0)}
                    </div>
                    <div>
                      <span className="font-bold text-[14px] text-txt-strong">
                        {attendee.name}
                      </span>
                      {attendee.agreed ? (
                        <span className="ml-2 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-txt-muted">
                          제안 동의
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {info.canEdit ? (
                    <div
                      className={cn(
                        "grid size-5 place-items-center rounded-md border transition-colors",
                        isSelected
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-line-strong bg-white",
                      )}
                    >
                      {isSelected ? <Icon name="check" size={13} strokeWidth={3} /> : null}
                    </div>
                  ) : (
                    <div>
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-800">
                          <Icon name="check" size={12} strokeWidth={2.5} />
                          참석 완료
                        </span>
                      ) : (
                        <span className="text-[12px] text-txt-faint">불참</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Sheet>
    <Toast msg={toast} />
  </>
);
}
