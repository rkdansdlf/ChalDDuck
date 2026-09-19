"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppBar,
  Body,
  Btn,
  Chip,
  Dock,
  Icon,
  Note,
  Panel,
  SecTitle,
  Toast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { MeetingProposal, MeetingSlot, MeetingWeek, Team } from "@/lib/types";
import {
  carryOverMeeting,
  confirmMeetingByDeadline,
  proposeMeeting,
  respondToMeeting,
} from "@/server/actions/meetings";

/** 기본 회의 길이 — 확정되지 않은 정책(1시간이 적당한지 팀 확인 필요). */
const DEFAULT_MINUTES = 60;

/**
 * 09 회의 시간 추천 / 10 전원 불가한 주.
 *
 * 두 화면은 같은 화면의 두 상태다 — 전원 가능한 후보가 하나라도 있으면 09,
 * 없으면 10(최다 인원 후보 + 비대면 참여 요청 + 다음 주 이월)으로 보인다.
 *
 * 확정 규칙: **특정 한 사람이 단독으로 확정하지 않는다.** 후보를 제안하면
 * 응답 마감까지 반대가 없을 때 자동으로 확정되고, 누구든 반대하면 확정되지 않는다.
 */
export function SlotsScreen({
  team,
  week,
  proposal,
  preview,
}: {
  team: Team;
  week: MeetingWeek;
  proposal: MeetingProposal;
  /** 데모 전용 — 전원 불가한 주를 미리 보는 중인지. 후보를 시간표에서 계산하면 없앤다. */
  preview?: "none";
}) {
  const router = useRouter();

  const { stage, slot: proposed } = proposal;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const picked = week.slots.find((s) => s.id === pickedId) ?? null;
  /** 전원 가능한 후보가 없는 주 — 10번 화면 흐름. */
  const noFullWeek = !week.hasFullAvailability;

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const propose = async () => {
    if (!picked) return;
    await proposeMeeting(picked.id);
    router.refresh();
    flash(`팀원 ${week.total - 1}명에게 확인 요청을 보냈습니다`);
  };

  return (
    <>
      <AppBar
        title="회의 시간"
        sub={team.name}
        onBack={() => router.push("/schedule")}
        action="settings-2"
        actionLabel="회의 설정"
      />

      <Body dense>
        <Panel s="fill" pad={14} r={16} className="mb-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="ok" icon="check">
              {week.submitted}명 시간표 제출
            </Chip>
            <Chip
              tone={noFullWeek ? "warn" : "ok"}
              icon={noFullWeek ? "user-minus" : "check"}
            >
              최대 {Math.max(...week.slots.map((s) => s.available))}명 참석 가능
            </Chip>
          </div>
        </Panel>

        {stage === "carried" ? (
          <ResultPanel
            icon="calendar-arrow-up"
            title="다음 주로 이월했습니다"
            note="이번 주 회의는 열리지 않습니다"
          />
        ) : stage === "confirmed" && proposed ? (
          <ResultPanel
            icon="calendar-check"
            title={`${proposed.day} ${proposed.time} · ${DEFAULT_MINUTES}분으로 확정`}
            note="응답 마감까지 반대가 없어 동의로 자동 확정됐습니다"
          />
        ) : stage === "proposed" && proposed ? (
          <>
            <Panel s="card" pad={16} r={18} className="mb-3">
              <div className="font-extrabold text-[18px] leading-[1.35] text-txt-strong">
                {proposed.day} {proposed.time}
              </div>
              <div className="t-cap-strong mt-[3px] text-txt-muted">
                {DEFAULT_MINUTES}분 · 제안 대기 중 · 응답 마감 {proposal.respondBy}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Chip tone="ok" icon="check">
                  동의 {proposal.agreed}명
                </Chip>
                <Chip tone="warn" icon="circle-dashed">
                  미응답 {proposal.pending}명
                </Chip>
                <Chip icon="x">반대 {proposal.against}명</Chip>
              </div>
            </Panel>

            <Note tone="warn" icon="clock" title="응답 마감까지 반대가 없으면 자동 확정됩니다">
              특정 한 사람이 확정하지 않습니다 — 누구나 반대하면 확정되지 않습니다.
            </Note>

            <div className="mt-2.5 flex flex-wrap gap-[7px]">
              {proposal.myResponse === null ? (
                <Btn
                  size="sm"
                  icon="check"
                  onClick={async () => {
                    await respondToMeeting(true);
                    router.refresh();
                    flash("동의했습니다");
                  }}
                >
                  동의하기
                </Btn>
              ) : null}
              <Btn
                size="sm"
                v="outline"
                icon="x"
                onClick={async () => {
                  await respondToMeeting(false);
                  setPickedId(null);
                  router.refresh();
                  flash("반대가 있어 확정되지 않았습니다");
                }}
              >
                참석 어려움 알리기
              </Btn>
              {/* 마감 시각이 되면 서버가 알아서 확정해야 하는 일인데, 그 예약 장치가 아직 없다.
                  그래서 화면에서 부르고 데모라고 적어 둔다. */}
              <Btn
                size="sm"
                v="ghost"
                icon="clock"
                onClick={async () => {
                  const result = await confirmMeetingByDeadline();
                  router.refresh();
                  flash(
                    result === "confirmed"
                      ? "반대가 없어 확정됐습니다"
                      : result === "blocked"
                        ? "반대가 있어 확정되지 않았습니다"
                        : "이미 정리된 제안입니다",
                  );
                }}
              >
                응답 마감 시뮬레이션 (데모)
              </Btn>
            </div>
          </>
        ) : (
          <>
            {noFullWeek ? (
              <>
                <Note
                  tone="warn"
                  icon="calendar-x"
                  title="이번 주에 전원 가능한 시간이 없습니다"
                  className="mb-3"
                >
                  시험 기간과 아르바이트가 겹쳐 {week.total}명 모두 되는 시간을 찾지 못했습니다.
                </Note>
                <Note tone="info" icon="list-ordered" className="mb-3">
                  정책: 전원 가능한 시간이 없으면 <b>최다 인원이 가능한 시간</b>을 후보로 보이고, 빠진
                  사람에게는 회의 전 <b>비대면으로 의견을 남길 기회</b>를 요청합니다. 다음 주로 넘기는 것은
                  팀이 버튼으로 직접 정합니다.
                </Note>
                <SecTitle className="mt-1" note="빠진 사람과 사유를 함께 표시합니다">
                  {Math.max(...week.slots.map((s) => s.available))}명 가능한 시간
                </SecTitle>
              </>
            ) : (
              <SecTitle note="모두의 수업·아르바이트·시험 기간을 뺀 결과입니다">
                모두 가능한 시간
              </SecTitle>
            )}

            <div role="radiogroup" aria-label="회의 시간 후보" className="flex flex-col gap-[9px]">
              {week.slots.map((slot) => (
                <SlotOption
                  key={slot.id}
                  slot={slot}
                  selected={pickedId === slot.id}
                  onSelect={() => setPickedId(slot.id)}
                />
              ))}
            </div>

            <Note tone="info" icon="list-ordered" className="mt-3.5">
              정책: 기본 회의 길이는 <b>{DEFAULT_MINUTES}분</b>. 후보 중 하나를 제안하면{" "}
              <b>응답 마감까지 반대가 없으면 자동 확정</b>되고, 반대가 있으면 확정되지 않습니다. 특정 한
              사람이 단독으로 확정하지 않습니다.
            </Note>

            <div className="mt-3.5 flex flex-wrap gap-[7px]">
              {noFullWeek ? (
                <>
                  <Btn
                    v="outline"
                    size="sm"
                    icon="user-round"
                    onClick={() => flash("빠진 팀원에게 비대면 의견 요청을 보냈습니다")}
                  >
                    비대면 참여 요청 보내기
                  </Btn>
                  <Btn
                    v="ghost"
                    size="sm"
                    icon="arrow-right"
                    onClick={async () => {
                      await carryOverMeeting();
                      router.refresh();
                    }}
                  >
                    다음 주로 이월 확정하기
                  </Btn>
                </>
              ) : null}

              {/* 데모 전용 — 서버가 붙으면 실제 시간표로만 판단하므로 없앤다. */}
              <Btn
                v="ghost"
                size="sm"
                icon="calendar-search"
                onClick={() =>
                  router.push(preview === "none" ? "/schedule/slots" : "/schedule/slots?preview=none")
                }
              >
                {preview === "none" ? "이번 주 후보 다시 보기" : "전원 불가한 주는 어떻게 보이나요"}
              </Btn>
            </div>
          </>
        )}
      </Body>

      {stage === "idle" ? (
        <Dock>
          <Btn full size="lg" disabled={!picked} onClick={propose} icon="calendar-check">
            {picked ? `${picked.day} ${picked.time} 로 제안` : "시간을 골라 주세요"}
          </Btn>
        </Dock>
      ) : null}

      <Toast msg={toast} />
    </>
  );
}

/** 후보 한 줄. 적합도 점수는 만들지 않고 몇 명이 되는지와 사유만 보여 준다. */
function SlotOption({
  slot,
  selected,
  onSelect,
}: {
  slot: MeetingSlot;
  selected: boolean;
  onSelect: () => void;
}) {
  const everyone = slot.available === slot.total;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "box-border flex w-full cursor-pointer items-center gap-[13px] rounded-[18px] px-4 py-3.5 text-left",
        selected ? "bg-yellow-100 border-[1.5px] border-yellow-500" : "bg-card border border-line",
      )}
    >
      <span
        className={cn(
          "grid size-11 flex-none place-items-center rounded-[13px]",
          selected ? "bg-yellow-400" : "bg-fill",
        )}
      >
        <span className="font-extrabold text-[17px] leading-none text-ink-900">{slot.day}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-mono font-bold text-[16px] leading-[1.35] text-txt-strong">
          {slot.time}
        </span>
        <span className="mt-[5px] flex flex-wrap gap-[5px]">
          <Chip tone={everyone ? "ok" : "warn"} icon={everyone ? "check" : "user-minus"}>
            {slot.available} / {slot.total}명 가능
          </Chip>
          {slot.blockedBy ? <Chip icon="info">{slot.blockedBy}</Chip> : null}
        </span>
      </span>

      {selected ? (
        <span className="flex-none text-yellow-700">
          <Icon name="circle-check" size={21} />
        </span>
      ) : null}
    </button>
  );
}

/** 확정·이월처럼 더 할 일이 없는 결과를 알리는 카드. */
function ResultPanel({
  icon,
  title,
  note,
}: {
  icon: "calendar-check" | "calendar-arrow-up";
  title: string;
  note: string;
}) {
  return (
    <Panel s="yellow" pad={18} r={18} className="text-center">
      <div
        className="mb-2 inline-flex size-11 items-center justify-center rounded-full text-yellow-700"
        style={{ background: "rgba(255,255,255,.75)" }}
      >
        <Icon name={icon} size={20} />
      </div>
      <div className="keep-all font-extrabold text-[16px] leading-[1.4] text-ink-900">{title}</div>
      <div className="keep-all mt-1 font-medium text-[13px] leading-[1.5] text-yellow-700">{note}</div>
    </Panel>
  );
}
