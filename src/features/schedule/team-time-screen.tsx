"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppBar,
  Avatar,
  Body,
  Btn,
  Chip,
  Dock,
  Icon,
  Note,
  Panel,
  Rows,
  SecTitle,
  Sheet,
  Toast,
  Undecided,
} from "@/components/ui";
import { proposeMeetingAt } from "@/server/actions/meetings";
import { askForTimetable } from "@/server/actions/schedule";
import { cn } from "@/lib/cn";
import type { MeetingProposal, ScheduleWeek, Team, TeamTimetable } from "@/lib/types";
import { MIN_ATTENDEES } from "./meeting-slots";
import { ScheduleTabs } from "./schedule-tabs";
import { dateOfDay } from "./week";
import { WeekPicker } from "./week-picker";

/** 칸의 진하기. 숫자와 함께 보여 준다 — 색만으로 몇 명인지 읽게 하지 않는다. */
type Level = "all" | "most" | "some" | "few";

const LEVEL: Record<Level, { label: string; bg: string; text: string }> = {
  all: { label: "전원 가능", bg: "var(--y-400)", text: "text-ink-900" },
  most: { label: "절반 이상", bg: "var(--y-200)", text: "text-ink-900" },
  some: { label: `${MIN_ATTENDEES}명 이상`, bg: "var(--y-50)", text: "text-txt" },
  few: { label: "모이기 어려움", bg: "var(--cr-100)", text: "text-txt-faint" },
};

function levelOf(available: number, total: number): Level {
  if (available < MIN_ATTENDEES) return "few";
  if (available === total) return "all";
  return available * 2 >= total ? "most" : "some";
}

/**
 * 팀 겹쳐보기 — 팀원들의 시간표를 한 격자에 겹쳐 본다.
 *
 * 칸마다 **그 시간에 되는 사람 수**를 적고, 누르면 누가 되고 누가 안 되는지 이름이 보인다.
 * **사유는 보이지 않는다** — 서버가 애초에 보내지 않는다(`getTeamTimetables`).
 *
 * 시간표를 내지 않은 사람은 회의 후보 계산(`computeMeetingSlots`)과 같게 **모든 시간이
 * 가능한 것으로 센다.** 여기서만 다르게 세면 "격자에서는 3명인데 후보에는 4명" 이 된다.
 * 대신 그 사실을 칸 설명과 아래 목록에 드러낸다.
 */
export function TeamTimeScreen({
  team,
  days,
  hours,
  weeks,
  members,
  proposal,
}: {
  team: Team;
  days: string[];
  hours: string[];
  /** 고를 수 있는 주. 첫 주가 회의 후보·제안의 주다. */
  weeks: ScheduleWeek[];
  members: TeamTimetable[];
  proposal: MeetingProposal;
}) {
  const router = useRouter();

  // 골라 보는 팀원. 기본은 전원이다.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(members.map((m) => m.id)));
  const [cell, setCell] = useState<{ day: number; hour: number } | null>(null);
  const [week, setWeek] = useState(weeks[0].key);
  /** 회의 제안은 첫 주 것만 — 후보와 확정 흐름(09)이 그 주를 기준으로 돈다. */
  const proposable = week === weeks[0].key;
  const [asked, setAsked] = useState<Set<string>>(
    () => new Set(members.filter((m) => m.askedToday).map((m) => m.id)),
  );
  const [working, setWorking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const shown = useMemo(() => members.filter((m) => picked.has(m.id)), [members, picked]);
  const everyone = shown.length === members.length;
  const missing = members.filter((m) => !m.submitted);

  /** 칸마다 안 되는 사람 id. */
  const busyAt = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const m of shown) {
      for (const b of m.busy) {
        // 매주 반복하는 것과 이 주에만 있는 것.
        if (b.weekOf !== null && b.weekOf !== week) continue;
        for (let h = b.startHour; h < b.startHour + b.hours; h += 1) {
          const key = `${b.day}:${h}`;
          const set = map.get(key) ?? new Set<string>();
          set.add(m.id);
          map.set(key, set);
        }
      }
    }
    return map;
  }, [shown, week]);

  const availableAt = (day: number, hour: number) =>
    shown.length - (busyAt.get(`${day}:${hour}`)?.size ?? 0);

  /** 올라와 있는 제안이 가리키는 칸. 격자에서 테두리로 짚어 준다. */
  const proposedCell = useMemo(() => {
    // 제안은 첫 주의 것이라 다른 주를 볼 때는 짚지 않는다.
    const slot = proposal.stage === "idle" || !proposable ? null : proposal.slot;
    if (!slot) return null;
    const day = days.indexOf(slot.day);
    const hour = hours.findIndex((h) => Number(h) === Number(slot.time.slice(0, 2)));
    return day >= 0 && hour >= 0 ? { day, hour } : null;
  }, [proposal, proposable, days, hours]);

  const toggleMember = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ask = async (m: TeamTimetable) => {
    if (working) return;
    setWorking(true);
    try {
      const result = await askForTimetable(m.id);
      setAsked((prev) => new Set(prev).add(m.id));
      flash(result === "sent" ? `${m.name}님에게 부탁했습니다` : "오늘은 이미 부탁했습니다");
    } finally {
      setWorking(false);
    }
  };

  const propose = async () => {
    if (!cell || working) return;
    setWorking(true);
    try {
      await proposeMeetingAt(cell.day, cell.hour);
      router.push("/schedule/slots");
    } catch (e) {
      flash(e instanceof Error ? e.message : "제안하지 못했습니다");
      setWorking(false);
    }
  };

  const hourText = (hour: number) => {
    const from = Number(hours[hour]);
    return `${from}시~${from + 1}시`;
  };

  // 시트에 보일 칸의 명단
  const sheet = cell
    ? (() => {
        const busy = busyAt.get(`${cell.day}:${cell.hour}`) ?? new Set<string>();
        return {
          free: shown.filter((m) => !busy.has(m.id)),
          busy: shown.filter((m) => busy.has(m.id)),
        };
      })()
    : null;

  return (
    <>
      <AppBar title="팀 시간표" sub={team.name} />
      <Body dense>
        <ScheduleTabs current="team" />
        <WeekPicker weeks={weeks} value={week} onChange={setWeek} />

        <p className="text-pretty-keep m-0 mb-3 text-[14.5px] leading-[1.6] text-txt">
          칸의 숫자는 그 시간에 <b>되는 사람 수</b>입니다. 칸을 누르면 누가 되는지 보입니다.
        </p>

        {/* 골라 보기 */}
        <div
          role="group"
          aria-label="겹쳐 볼 팀원"
          className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5"
        >
          {members.map((m) => {
            const on = picked.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMember(m.id)}
                className={cn(
                  "inline-flex min-h-11 flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-xl py-1 pr-3 pl-1.5 font-bold text-[13px] leading-none",
                  on
                    ? "border border-transparent bg-action text-on-action"
                    : "border border-line bg-card text-txt-muted",
                )}
              >
                <Avatar name={m.name} mbti={m.mbti} size={26} />
                {m.isMe ? "나" : m.name}
                {/* 켜짐·꺼짐을 색만으로 나누지 않는다. */}
                <Icon name={on ? "check" : "plus"} size={13} />
              </button>
            );
          })}
        </div>
        {!everyone ? (
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="t-cap keep-all text-txt-muted">
              {members.length}명 중 {shown.length}명만 겹쳐 보는 중
            </span>
            <Btn
              size="sm"
              v="ghost"
              icon="rotate-ccw"
              onClick={() => setPicked(new Set(members.map((m) => m.id)))}
            >
              전원 보기
            </Btn>
          </div>
        ) : null}

        <Panel s="card" pad={12} r={16} className="mb-2">
          {shown.length === 0 ? (
            <p className="t-note keep-all m-0 py-6 text-center text-txt-muted">
              겹쳐 볼 팀원을 한 명 이상 골라 주세요.
            </p>
          ) : (
            <div
              className="grid gap-[3px]"
              style={{
                gridTemplateColumns: `26px repeat(${days.length},minmax(0,1fr))`,
                gridTemplateRows: `auto repeat(${hours.length},44px)`,
              }}
            >
              <span />
              {days.map((day, i) => (
                <span
                  key={day}
                  className="pb-1.5 text-center font-bold text-[13px] leading-none text-txt-muted"
                >
                  {day}
                  <span className="mt-1 block font-mono font-medium text-[10.5px] text-txt-faint">
                    {dateOfDay(week, i)}
                  </span>
                </span>
              ))}
              {hours.map((hour, hourIndex) => (
                <div key={hour} className="contents">
                  <span className="pt-1 pr-1 text-right font-mono font-medium text-[11.5px] leading-none text-txt-faint">
                    {hour}
                  </span>
                  {days.map((day, dayIndex) => {
                    const n = availableAt(dayIndex, hourIndex);
                    const level = LEVEL[levelOf(n, shown.length)];
                    const isProposed =
                      proposedCell?.day === dayIndex && proposedCell.hour === hourIndex;
                    return (
                      <button
                        key={`${day}-${hour}`}
                        type="button"
                        onClick={() => setCell({ day: dayIndex, hour: hourIndex })}
                        aria-label={`${day} ${hourText(hourIndex)} — ${shown.length}명 중 ${n}명 가능${isProposed ? ", 제안된 시간" : ""}`}
                        className={cn(
                          "relative grid cursor-pointer place-items-center rounded-md border-none p-0 font-mono font-bold text-[13px] leading-none",
                          level.text,
                          isProposed && "ring-2 ring-ink-900 ring-inset",
                        )}
                        style={{ background: level.bg }}
                      >
                        {n}
                        {isProposed ? (
                          <span className="absolute top-0.5 right-0.5 text-ink-900">
                            <Icon name="calendar-check" size={11} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* 범례 */}
        <div className="mb-3.5 flex flex-wrap gap-x-2.5 gap-y-1.5">
          {(Object.keys(LEVEL) as Level[]).map((key) => (
            <span
              key={key}
              className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted"
            >
              <span
                className="size-2.5 rounded-[3px] border border-line"
                style={{ background: LEVEL[key].bg }}
              />
              {LEVEL[key].label}
            </span>
          ))}
          {proposedCell ? (
            <span className="t-cap-strong inline-flex items-center gap-[5px] text-txt-muted">
              <Icon name="calendar-check" size={12} />
              제안된 시간
            </span>
          ) : null}
        </div>

        {missing.length > 0 ? (
          <>
            <SecTitle note="모든 시간이 되는 것으로 셉니다">
              아직 시간표가 없는 팀원 {missing.length}명
            </SecTitle>
            <Rows className="mb-3.5">
              {missing.map((m) => (
                <div key={m.id} className="flex min-h-12 items-center gap-2.5 px-[15px] py-2.5">
                  <Avatar name={m.name} mbti={m.mbti} size={28} />
                  <span className="min-w-0 flex-1 font-semibold text-[14px] leading-[1.4] text-txt-strong">
                    {m.isMe ? "나" : m.name}
                  </span>
                  {m.isMe ? (
                    <Btn size="sm" v="outline" onClick={() => router.push("/schedule")}>
                      내 시간 적기
                    </Btn>
                  ) : asked.has(m.id) ? (
                    <Chip tone="ok" icon="check">
                      오늘 부탁함
                    </Chip>
                  ) : (
                    <Btn size="sm" v="outline" icon="bell" disabled={working} onClick={() => ask(m)}>
                      부탁하기
                    </Btn>
                  )}
                </div>
              ))}
            </Rows>
          </>
        ) : null}

        <Note tone="info" icon="eye-off">
          팀원의 <b>되는지 / 안 되는지</b>만 보입니다. 수업명, 근무지, 시험 과목 같은 사유는 본인에게만
          보입니다.
        </Note>

        <Undecided>
          <b>칸별로 누가 되는지 이름을 보여 줍니다.</b> 화면 문구 “팀원에게는 가능 / 불가만 보입니다”를
          사람별 가능·불가 공개로 읽었습니다 — 인원 수만 보여야 한다면 시트의 명단을 뺍니다.
          <br />
          <b>시간표 부탁하기는 받는 사람당 하루 한 번</b>입니다. 업무 콕 찌르기와 같은 기준을 따랐습니다.
          <br />
          <b>격자에서 고른 칸은 올라온 제안이 없을 때만 제안</b>할 수 있습니다(09 화면과 같은 기준).
        </Undecided>
      </Body>

      <Dock>
        <Btn
          full
          size="lg"
          icon="calendar-clock"
          iconRight="arrow-right"
          onClick={() => router.push("/schedule/slots")}
        >
          추천 회의 시간 보기
        </Btn>
      </Dock>

      <Sheet
        open={cell !== null}
        title={
          cell
            ? `${days[cell.day]}(${dateOfDay(week, cell.day)}) ${hourText(cell.hour)}`
            : undefined
        }
        onClose={() => setCell(null)}
      >
        {cell && sheet ? (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Chip tone={sheet.free.length === shown.length ? "ok" : "n"} icon="users-round">
                {shown.length}명 중 {sheet.free.length}명 가능
              </Chip>
              {!everyone ? <Chip icon="eye">골라 본 {shown.length}명 기준</Chip> : null}
            </div>

            <MemberList title="되는 사람" icon="check" people={sheet.free} />
            <MemberList title="안 되는 사람" icon="x" people={sheet.busy} />

            <SheetAction
              proposable={proposable}
              firstWeekName={weeks[0].name}
              everyone={everyone}
              available={sheet.free.length}
              proposal={proposal}
              working={working}
              onPropose={propose}
              onSeeProposal={() => router.push("/schedule/slots")}
              onShowEveryone={() => setPicked(new Set(members.map((m) => m.id)))}
            />
          </>
        ) : null}
      </Sheet>

      <Toast msg={toast} />
    </>
  );
}

function MemberList({
  title,
  icon,
  people,
}: {
  title: string;
  icon: "check" | "x";
  people: TeamTimetable[];
}) {
  return (
    <div className="mb-3">
      <div className="t-cap-strong mb-1.5 inline-flex items-center gap-1 text-txt-muted">
        <Icon name={icon} size={12} />
        {title} {people.length}명
      </div>
      {people.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {people.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-fill py-1 pr-2.5 pl-1 text-[13px] font-semibold text-txt-strong"
            >
              <Avatar name={m.name} mbti={m.mbti} size={22} />
              {m.isMe ? "나" : m.name}
              {!m.submitted ? <span className="t-cap text-txt-faint">· 시간표 없음</span> : null}
            </span>
          ))}
        </div>
      ) : (
        <p className="t-cap m-0 text-txt-faint">없음</p>
      )}
    </div>
  );
}

/** 시트 맨 아래 — 이 칸으로 무엇을 할 수 있는지. 할 수 없으면 왜 안 되는지를 말한다. */
function SheetAction({
  proposable,
  firstWeekName,
  everyone,
  available,
  proposal,
  working,
  onPropose,
  onSeeProposal,
  onShowEveryone,
}: {
  proposable: boolean;
  firstWeekName: string;
  everyone: boolean;
  available: number;
  proposal: MeetingProposal;
  working: boolean;
  onPropose: () => void;
  onSeeProposal: () => void;
  onShowEveryone: () => void;
}) {
  if (proposal.stage !== "idle") {
    return (
      <>
        <Note tone="info" icon="calendar-check">
          {proposal.stage === "proposed" ? "이미 올라온 회의 제안이 있습니다" : "이미 정해진 회의가 있습니다"}
          {proposal.slot ? ` (${proposal.slot.day} ${proposal.slot.time})` : ""}.
        </Note>
        <Btn full v="outline" className="mt-3" iconRight="arrow-right" onClick={onSeeProposal}>
          회의 시간 화면에서 보기
        </Btn>
      </>
    );
  }

  if (!proposable) {
    return (
      <Note tone="info" icon="calendar-clock">
        회의 제안은 {firstWeekName} 시간으로만 할 수 있습니다. 이 주는 미리 보기입니다.
      </Note>
    );
  }

  // 회의 제안은 팀 전체에 가는 것이라 일부만 골라 본 숫자로 제안하면 오해가 생긴다.
  if (!everyone) {
    return (
      <>
        <Note tone="info" icon="users-round">
          회의 제안은 팀 전체 기준입니다. 전원을 겹쳐 본 상태에서 제안할 수 있습니다.
        </Note>
        <Btn full v="outline" icon="rotate-ccw" className="mt-3" onClick={onShowEveryone}>
          전원 보기
        </Btn>
      </>
    );
  }

  if (available < MIN_ATTENDEES) {
    return (
      <Note tone="info" icon="circle-alert">
        이 시간에는 {MIN_ATTENDEES}명 이상 모일 수 없어 제안할 수 없습니다.
      </Note>
    );
  }

  return (
    <>
      <Btn full icon="calendar-check" disabled={working} onClick={onPropose}>
        {working ? "제안하는 중…" : "이 시간으로 회의 제안"}
      </Btn>
      <p className="t-cap keep-all m-0 mt-2 text-center text-txt-muted">
        응답 마감까지 반대가 없으면 확정됩니다.
      </p>
    </>
  );
}
