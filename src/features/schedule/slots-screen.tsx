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
import { useAction } from "@/lib/use-action";
import { whenText } from "./meeting-cell";
import { downloadIcsFile, generateGoogleCalendarUrl, generateIcsContent } from "./calendar-export";
import { MeetingNoteSheet } from "./meeting-note-sheet";
import { MeetingChemistrySheet } from "@/features/saju/meeting-chemistry-sheet";
import { clearMeetingFlow } from "@/server/actions/meeting-flow";
import { MeetingAttendanceSheet } from "./meeting-attendance-sheet";
import {
  carryOverMeeting,
  fastForwardMeetingDeadline,
  proposeMeeting,
  requestRemoteInput,
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
  devDemo,
}: {
  team: Team;
  week: MeetingWeek;
  proposal: MeetingProposal;
  /** 24시간을 기다리지 않고 마감 뒤 화면을 보는 버튼을 띄울지. 개발 환경에서만 참. */
  devDemo: boolean;
}) {
  const router = useRouter();

  const { stage, slot: proposed } = proposal;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [location, setLocation] = useState("");
  const [agenda, setAgenda] = useState("");
  const [viewingNote, setViewingNote] = useState(false);
  const [viewingAttendance, setViewingAttendance] = useState(false);
  const [viewingChemistry, setViewingChemistry] = useState(false);
  const { toast, busy, flash, run } = useAction();
  const requesting = busy.request === true;

  const picked = week.slots.find((s) => s.id === pickedId) ?? null;
  /**
   * 아직 후보 자체가 없는 상태.
   *
   * 새로 만든 팀이 여기 처음 들어오면 후보가 하나도 없다. 이걸 "전원 불가한 주"와
   * 같이 취급하면 `Math.max()` 가 빈 배열에서 `-Infinity` 를 내고
   * "최대 -Infinity명 참석 가능"이 화면에 뜬다(실제로 그랬다).
   */
  const noSlots = week.slots.length === 0;
  /** 아직 나 혼자인 팀. 시간표를 더 내도 후보가 생기지 않는다 — 부를 사람이 먼저다. */
  const alone = week.total < 2;
  /**
   * 전원 가능한 후보가 없는 주 — 10번 화면 흐름.
   *
   * **후보가 하나도 없는 경우도 여기에 들어간다.** 예전에는 `!noSlots` 를 요구해서
   * 후보가 아예 없을 때 이 조건이 거짓이 되었다 — 그러면 "이번 주에 회의가 불가능하다"는
   * 판단이 가장 확실한 순간에 이 화면이 사라지고, 다음 주로 넘길 수도, 누구에게 물을 수도
   * 없는 자리가 되게 했다.
   */
  const noFullWeek = !noSlots && !week.hasFullAvailability;
  /**
   * 이번 주에 회의를 잡을 수 없는 상태인가.
   *
   * 후보가 하나도 없는 경우를 **반드시 포함**한다. 후보가 없는 가장 확실한 순간에 이
   * 판단이 거짓이 되면, 다음 주로 넘기는 결정조차 할 수 없는 자리가 된다.
   */
  const cannotMeetThisWeek = noSlots || !week.hasFullAvailability;
  const bestAvailable = noSlots ? 0 : Math.max(...week.slots.map((s) => s.available));

  /**
   * 후보를 팀에 제안한다.
   *
   * 화면을 오래 열어둔 사이 팀원이 시간표를 바꿔 두면 그 사이 후보가 다시 만들어져
   * 고른 칸이 사라진다. 그때 서버가 "후보를 찾을 수 없습니다"로 거절하는데, 예전에는
   * 예외를 그대로 두었으므로 아무 말 없이 아무 일도 일어나지 않았다.
   */
  const propose = async () => {
    if (!picked) return;
    await run(
      "propose",
      async () => {
        await proposeMeeting(picked.id, {
          location: location.trim() || null,
          agenda: agenda.trim() || null,
          durationMinutes,
        });
        router.refresh();
        return `팀원 ${week.total - 1}명에게 확인 요청을 보냈습니다`;
      },
      "제안하지 못했습니다. 후보가 바뀌었을 수 있으니 시간을 다시 골라 주세요.",
    );
  };

  return (
    <>
      <AppBar
        title="회의 시간"
        sub={team.name}
        onBack={() => router.push("/schedule")}
      />

      <Body dense>
        <Panel s="fill" pad={14} r={16} className="mb-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="ok" icon="check">
              {week.submitted}명 시간표 제출
            </Chip>
            {noSlots ? (
              <Chip tone={cannotMeetThisWeek ? "warn" : "n"} icon="circle-dashed">
                {alone ? "팀원이 아직 없습니다" : "후보를 아직 만들지 못했습니다"}
              </Chip>
            ) : (
              <Chip tone={noFullWeek ? "warn" : "ok"} icon={noFullWeek ? "user-minus" : "check"}>
                최대 {bestAvailable}명 참석 가능
              </Chip>
            )}
          </div>
        </Panel>

        {/* 이월은 결정을 미룬 것이다. 그래도 시간 고르기는 열려 있어야 한다 — 예전에는
            이 카드 하나만 떠서 후보도 Dock 도 없이 갇혔다(되돌아갈 길이 없었다). */}
        {stage === "carried" ? (
          <ResultPanel
            icon="calendar-arrow-up"
            title="다음 주로 이월했습니다"
            note="이번 주 회의는 열리지 않습니다. 아래에서 다른 시간을 다시 고를 수 있어요"
          />
        ) : null}

        {stage === "confirmed" && proposed ? (
          <div className="mb-4">
            <ResultPanel
              icon="calendar-check"
              title={`${whenText(proposal.date, proposed.day, proposed.time)} · ${proposal.durationMinutes ?? DEFAULT_MINUTES}분으로 확정`}
              note="응답 마감까지 반대가 없어 동의로 자동 확정됐습니다"
            />

            {(proposal.location || proposal.agenda) ? (
              <Panel s="card" pad={14} r={16} className="mb-3">
                {proposal.location ? (
                  <div className="mb-1.5 flex items-center gap-2 text-[13px] text-txt">
                    <Icon name="map-pin" size={15} />
                    <span className="font-semibold text-txt-muted">장소:</span>
                    <span>{proposal.location}</span>
                  </div>
                ) : null}
                {proposal.agenda ? (
                  <div className="flex items-center gap-2 text-[13px] text-txt">
                    <Icon name="file-text" size={15} />
                    <span className="font-semibold text-txt-muted">안건:</span>
                    <span>{proposal.agenda}</span>
                  </div>
                ) : null}
              </Panel>
            ) : null}

            {/* 저장해 둔 진행 방식 — 회의 케미 시트에서 저장한다. 안건과 따로 둔다(안건은 회의록 제목으로 쓰인다). */}
            {proposal.flow ? (
              <Panel s="card" pad={14} r={16} className="mb-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[13px] font-semibold text-txt-muted">
                    <Icon name="list-ordered" size={15} />
                    진행 방식
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!proposal.id) return;
                      try {
                        const res = await clearMeetingFlow(proposal.id);
                        if (res === "ok") router.refresh();
                        else flash("지우지 못했습니다");
                      } catch {
                        flash("지우지 못했습니다");
                      }
                    }}
                    className="t-cap-strong cursor-pointer border-none bg-transparent p-0 text-txt-muted underline underline-offset-2"
                  >
                    지우기
                  </button>
                </div>
                <p className="text-pretty-keep m-0 whitespace-pre-line text-[13.5px] leading-[1.6] text-txt">
                  {proposal.flow}
                </p>
              </Panel>
            ) : null}

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Btn
                  size="sm"
                  v="outline"
                  icon="calendar"
                  className="flex-1"
                  onClick={() => {
                    const ics = generateIcsContent({
                      title: `${team.name} 정기 회의`,
                      date: proposal.date ?? "2026-10-01",
                      time: proposed.time,
                      durationMinutes: proposal.durationMinutes ?? 60,
                      location: proposal.location,
                      agenda: proposal.agenda,
                    });
                    downloadIcsFile(`${team.name}_회의.ics`, ics);
                    flash("회의 일정(.ics)을 다운로드했습니다");
                  }}
                >
                  .ics 다운로드
                </Btn>
                <Btn
                  size="sm"
                  v="outline"
                  icon="external-link"
                  className="flex-1"
                  onClick={() => {
                    const url = generateGoogleCalendarUrl({
                      title: `${team.name} 정기 회의`,
                      date: proposal.date ?? "2026-10-01",
                      time: proposed.time,
                      durationMinutes: proposal.durationMinutes ?? 60,
                      location: proposal.location,
                      agenda: proposal.agenda,
                    });
                    window.open(url, "_blank");
                  }}
                >
                  Google 캘린더
                </Btn>
              </div>

              <div className="flex gap-2">
                {proposal.hasNote ? (
                  <Btn
                    v="yellow"
                    icon="file-text"
                    className="flex-1"
                    onClick={() => setViewingNote(true)}
                  >
                    회의록 보기
                  </Btn>
                ) : null}
                <Btn
                  v={proposal.hasNote ? "outline" : "yellow"}
                  icon="book-open"
                  className="flex-1"
                  onClick={() => router.push(proposal.id ? `/tools/clerk?meetingId=${proposal.id}` : "/tools/clerk")}
                >
                  {proposal.hasNote ? "AI 서기 다시 작성" : "AI 서기로 회의록 작성하기"}
                </Btn>
              </div>

              <Btn
                v="outline"
                icon="users-round"
                className="w-full"
                onClick={() => setViewingAttendance(true)}
              >
                참석자 출석 체크
              </Btn>

              {/* 회의 케미 — 참석 예정자의 오행으로 본 진행 방식 제안. 역할을 정하지 않는다. */}
              <Btn
                v="outline"
                icon="sparkles"
                className="w-full"
                onClick={() => setViewingChemistry(true)}
              >
                회의 케미 보기
              </Btn>
            </div>
          </div>
        ) : stage === "proposed" && proposed ? (
          <>
            <Panel s="card" pad={16} r={18} className="mb-3">
              <div className="font-extrabold text-[18px] leading-[1.35] text-txt-strong">
                {whenText(proposal.date, proposed.day, proposed.time)}
              </div>
              <div className="t-cap-strong mt-[3px] text-txt-muted">
                {proposal.durationMinutes ?? DEFAULT_MINUTES}분 · 제안 대기 중 · 응답 마감 {proposal.respondBy}
              </div>
              {proposal.location ? (
                <div className="mt-2 flex items-center gap-1.5 text-[12px] text-txt-muted">
                  <Icon name="map-pin" size={14} />
                  <span>장소: {proposal.location}</span>
                </div>
              ) : null}
              {proposal.agenda ? (
                <div className="mt-1 flex items-center gap-1.5 text-[12px] text-txt-muted">
                  <Icon name="file-text" size={14} />
                  <span>안건: {proposal.agenda}</span>
                </div>
              ) : null}
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
                    const result = await respondToMeeting(true);
                    router.refresh();
                    flash(result === "ok" ? "동의했습니다" : "응답 마감이 지났습니다");
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
                  const result = await respondToMeeting(false);
                  setPickedId(null);
                  router.refresh();
                  flash(
                    result === "ok"
                      ? "반대가 있어 확정되지 않았습니다"
                      : "응답 마감이 지나 더 이상 반대할 수 없습니다",
                  );
                }}
              >
                반대하기
              </Btn>
              {/* 마감은 서버의 예약 작업이 잰다(`/api/cron/meetings`). 이 버튼은 24시간을
                  기다리지 않고 마감 뒤 화면을 보기 위해 **시계만 당기는** 것이고,
                  확정 여부는 평소와 똑같이 규칙이 정한다. 개발 환경에서만 보인다. */}
              {devDemo ? (
                <Btn
                  size="sm"
                  v="ghost"
                  icon="clock"
                  onClick={async () => {
                    await fastForwardMeetingDeadline();
                    router.refresh();
                    flash("응답 마감을 지금으로 당겼습니다");
                  }}
                >
                  마감 지금으로 당기기 (데모)
                </Btn>
              ) : null}
            </div>
          </>
        ) : (
          <>
            {noSlots ? (
              <>
                <Note
                  tone="warn"
                  icon="calendar-x"
                  title="아직 회의 시간 후보가 없습니다"
                  className="mb-3"
                >
                  {alone ? (
                    <>
                      회의 시간은 <b>두 사람 이상</b>의 시간표를 겹쳐 찾습니다. 팀 탭의 초대 코드를
                      공유해 팀원을 부른 뒤 다시 와 주세요.
                    </>
                  ) : (
                    <>
                      후보는 팀원들이 낸 <b>안 되는 시간</b>에서 만들어집니다. 일정 탭에서 내 시간표를
                      먼저 넣어 주세요. 팀원이 모두 내면 모두 되는 시간이 후보로 올라옵니다.
                      {/* 오늘의 후보는 <b>아직 지나가지 않은 시간</b>만 오른다. 밤이 늦으면 오늘
                          후보가 하나도 남지 않을 수 있는데, 그건 시간이 없다는 뜻이지 오류가 아니다. */}
                      <b>오늘은 이미 지나간 시간은 후보에 넣지 않습니다.</b>
                    </>
                  )}
                </Note>
                {/* 후보가 아예 없더라도 이 주를 넘길 수는 있어야 한다. 전원이 겹쳐 버린
                    가장 무거운 경우에 "다음 주로 넘기자"가 사라져 있었다. */}
                {alone ? null : (
                  <Btn
                    v="ghost"
                    size="sm"
                    icon="arrow-right"
                    disabled={busy.carry}
                    onClick={() =>
                      void run(
                        "carry",
                        async () => {
                          await carryOverMeeting();
                          router.refresh();
                          return "이번 주 회의를 다음 주로 넘겼습니다";
                        },
                        "이월하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
                      )
                    }
                  >
                    다음 주로 넘기기
                  </Btn>
                )}
              </>
            ) : noFullWeek ? (
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
                <SecTitle className="mt-1" note="빠진 사람이 몇 명인지 함께 표시합니다">
                  {bestAvailable}명 가능한 시간
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

            {picked ? (
              <Panel s="card" pad={14} r={16} className="mt-3.5">
                <div className="mb-2 font-bold text-[14px] text-txt-strong">
                  회의 세부 정보 (선택사항)
                </div>

                <div className="mb-2.5">
                  <label className="mb-1 block text-[12px] font-semibold text-txt-muted">
                    회의 소요 시간
                  </label>
                  <div className="flex gap-1.5">
                    {[30, 60, 90, 120].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setDurationMinutes(mins)}
                        className={cn(
                          "flex-1 rounded-lg py-1 text-[12px] font-semibold transition-colors",
                          durationMinutes === mins
                            ? "bg-action text-on-action"
                            : "border border-line bg-card text-txt-muted hover:bg-fill",
                        )}
                      >
                        {mins === 60 ? "1시간" : mins === 90 ? "1.5시간" : mins === 120 ? "2시간" : `${mins}분`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-2.5">
                  <label className="mb-1 block text-[12px] font-semibold text-txt-muted">
                    회의 장소 또는 접속 링크
                  </label>
                  <input
                    type="text"
                    placeholder="예: 중앙도서관 세미나실 3호 / Zoom 링크"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    maxLength={100}
                    className="box-border w-full rounded-xl border border-line bg-fill px-3 py-2 text-[13px] text-txt outline-none focus:border-action"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-txt-muted">
                    회의 안건 (목표)
                  </label>
                  <input
                    type="text"
                    placeholder="예: 중간보고서 초안 검토 및 파트 분배"
                    value={agenda}
                    onChange={(e) => setAgenda(e.target.value)}
                    maxLength={200}
                    className="box-border w-full rounded-xl border border-line bg-fill px-3 py-2 text-[13px] text-txt outline-none focus:border-action"
                  />
                </div>
              </Panel>
            ) : null}

            <Note tone="info" icon="list-ordered" className="mt-3.5">
              정책: 기본 회의 길이는 <b>{durationMinutes}분</b>. 후보 중 하나를 제안하면{" "}
              <b>응답 마감까지 반대가 없으면 자동 확정</b>되고, 반대가 있으면 확정되지 않습니다. 특정 한
              사람이 단독으로 확정하지 않습니다.
            </Note>

            <div className="mt-3.5 flex flex-wrap gap-[7px]">
              {noFullWeek ? (
                <>
                  {/* 누가 빠지는지는 후보마다 다르다 — 시간을 고른 뒤에야 보낼 곳이 정해진다.
                      예전에는 고르지 않아도 "보냈습니다"가 떴지만 아무에게도 가지 않았다. */}
                  <Btn
                    v="outline"
                    size="sm"
                    icon="user-round"
                    disabled={!picked || requesting}
                    onClick={() => {
                      if (!picked) return;
                      void run(
                        "request",
                        async () => {
                          const sent = await requestRemoteInput(picked.id);
                          return sent > 0
                            ? `이 시간에 못 오는 ${sent}명에게 의견 요청을 보냈습니다`
                            : "이 시간에 빠지는 다른 팀원이 없습니다";
                        },
                        "요청을 보내지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
                      );
                    }}
                  >
                    {picked ? "빠진 팀원에게 의견 요청하기" : "시간을 고른 뒤 요청할 수 있습니다"}
                  </Btn>
                  <Btn
                    v="ghost"
                    size="sm"
                    icon="arrow-right"
                    disabled={busy.carry}
                    onClick={() =>
                      void run(
                        "carry",
                        async () => {
                          await carryOverMeeting();
                          router.refresh();
                          return "이번 주 회의를 다음 주로 넘겼습니다";
                        },
                        "이월하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
                      )
                    }
                  >
                    다음 주로 넘기기
                  </Btn>
                </>
              ) : null}

            </div>
          </>
        )}
      </Body>

      {/* 이월은 보류일 뿐 결정이 아니므로, 후보를 고르고 다시 제안할 수 있다.
          **확정된 회의도 그렇다** — 그건 이미 정해진 사실이지 진행 중인 결정이 아니므로, 다음
          회의를 그 뒤에 별개로 잡을 수 있다. 예전에는 `idle`·`carried` 만 열려 있었고,
          확정 카드가 뜨는 순간 Dock 이 사라져 팀이 두 번째 회의를 잡을 곳이 아예 없어졌다. */}
      {stage !== "proposed" ? (
        <Dock>
          {/* 후보가 없을 때 "시간을 골라 주세요"를 비활성으로 띄우면 고를 것이 없는데
              고르라고 하는 셈이다. 그 상태에서 할 수 있는 일은 시간표를 내는 것뿐이다. */}
          {noSlots ? (
            alone ? (
              <Btn full size="lg" icon="user-round" onClick={() => router.push("/team")}>
                팀원 초대하러 가기
              </Btn>
            ) : (
              /* 후보가 없는데 "넣으러 가기"만 두면, 전원이 겹쳐 버린 팀에게는 유일하게 남은
                 결정("이번 주는 넘기자")이 화면에 없다. 둘을 함께 둔다. */
              <div className="flex flex-col gap-2">
                <Btn full size="lg" icon="calendar-clock" onClick={() => router.push("/schedule")}>
                  내 시간표 넣으러 가기
                </Btn>
                <Btn
                  full
                  size="sm"
                  v="ghost"
                  icon="arrow-right"
                  disabled={busy.carry}
                  onClick={() =>
                    void run(
                      "carry",
                      async () => {
                        await carryOverMeeting();
                        router.refresh();
                        return "이번 주 회의를 다음 주로 넘겼습니다";
                      },
                      "이월하지 못했습니다. 잠시 뒤 다시 눌러 주세요.",
                    )
                  }
                >
                  다음 주로 넘기기
                </Btn>
              </div>
            )
          ) : (
            <Btn full size="lg" disabled={!picked} onClick={propose} icon="calendar-check">
              {picked ? `${picked.day} ${picked.time} 로 제안` : "시간을 골라 주세요"}
            </Btn>
          )}
        </Dock>
      ) : null}

      <MeetingNoteSheet
        open={viewingNote}
        meetingId={proposal.id ?? null}
        title={proposal.agenda || "정기 팀 회의록"}
        onClose={() => setViewingNote(false)}
      />

      <MeetingAttendanceSheet
        open={viewingAttendance}
        meetingId={proposal.id ?? null}
        meetingTitle={`${whenText(proposal.date, proposed?.day ?? "", proposed?.time ?? "")} 회의 출석`}
        onClose={() => setViewingAttendance(false)}
        onSaved={() => router.refresh()}
      />

      <MeetingChemistrySheet
        open={viewingChemistry}
        meetingId={proposal.id ?? null}
        durationMinutes={proposal.durationMinutes ?? DEFAULT_MINUTES}
        savedFlow={proposal.flow ?? null}
        onClose={() => setViewingChemistry(false)}
      />

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
        "box-border flex w-full cursor-pointer items-center gap-[13px] rounded-[18px] px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.985]",
        selected ? "bg-yellow-100 border-[1.5px] border-yellow-500 shadow-sm" : "bg-card border border-line hover:border-yellow-300",
      )}
    >
      <span
        className={cn(
          "grid size-11 flex-none place-items-center rounded-[13px] transition-colors",
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
        <span className="flex-none text-yellow-700 animate-pop">
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
  className = "mb-3",
}: {
  icon: "calendar-check" | "calendar-arrow-up";
  title: string;
  note: string;
  className?: string;
}) {
  return (
    <Panel s="yellow" pad={18} r={18} className={cn("text-center animate-slide-up", className)}>
      <div
        className="mb-2 inline-flex size-11 items-center justify-center rounded-full text-yellow-700 animate-pop"
        style={{ background: "rgba(255,255,255,.75)" }}
      >
        <Icon name={icon} size={20} />
      </div>
      <div className="keep-all font-extrabold text-[16px] leading-[1.4] text-ink-900">{title}</div>
      <div className="keep-all mt-1 font-medium text-[13px] leading-[1.5] text-yellow-700">{note}</div>
    </Panel>
  );
}
