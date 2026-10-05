"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AppBar,
  Body,
  Chip,
  Icon,
  Panel,
  Rows,
  SecTitle,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CalendarEvent, CalendarEventType, Team } from "@/lib/types";
import { ScheduleTabs } from "./schedule-tabs";
import { groupEventsByDate } from "./calendar-events";
import { todayInSeoul } from "./week";
import { MeetingNoteSheet } from "./meeting-note-sheet";

const DAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

function padZero(n: number): string {
  return String(n).padStart(2, "0");
}

type CalendarDay = {
  date: string; // YYYY-MM-DD
  dayNum: number;
  isCurrentMonth: boolean;
  isToday: boolean;
};

/** 특정 연도/월의 월간 달력 날짜 목록 (월요일 시작, 7의 배수 개수) */
function getMonthDays(year: number, month: number, today: string): CalendarDay[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));

  // 0 = 일, 1 = 월 ... 6 = 토 -> 0 = 월 ... 6 = 일 변환
  const startWeekday = (firstDay.getUTCDay() + 6) % 7;
  const daysInMonth = lastDay.getUTCDate();

  const days: CalendarDay[] = [];

  // 이전 달 날짜들
  const prevMonthLastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevMonthLastDay - i;
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    const dateStr = `${prevY}-${padZero(prevM)}-${padZero(d)}`;
    days.push({
      date: dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateStr === today,
    });
  }

  // 이번 달 날짜들
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${padZero(month)}-${padZero(d)}`;
    days.push({
      date: dateStr,
      dayNum: d,
      isCurrentMonth: true,
      isToday: dateStr === today,
    });
  }

  // 다음 달 날짜들 (총 개수가 7의 배수가 되도록)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextM = month === 12 ? 1 : month + 1;
    const nextY = month === 12 ? year + 1 : year;
    const dateStr = `${nextY}-${padZero(nextM)}-${padZero(d)}`;
    days.push({
      date: dateStr,
      dayNum: d,
      isCurrentMonth: false,
      isToday: dateStr === today,
    });
  }

  return days;
}

export function CalendarScreen({
  team,
  events,
  initialToday,
}: {
  team: Team;
  events: CalendarEvent[];
  initialToday?: string;
}) {
  const router = useRouter();
  const today = initialToday ?? todayInSeoul();

  const [currentYear, currentMonth] = useMemo(() => {
    const [y, m] = today.split("-").map(Number);
    return [y, m];
  }, [today]);

  const [viewYear, setViewYear] = useState(currentYear);
  const [viewMonth, setViewMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [filterType, setFilterType] = useState<CalendarEventType | "all">("all");
  const [viewingNote, setViewingNote] = useState<{ meetingId: string; title: string } | null>(null);

  const calendarDays = useMemo(
    () => getMonthDays(viewYear, viewMonth, today),
    [viewYear, viewMonth, today],
  );

  const eventMap = useMemo(() => groupEventsByDate(events), [events]);

  const prevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(currentYear);
    setViewMonth(currentMonth);
    setSelectedDate(today);
  };

  // 선택된 날짜의 이벤트 또는 전체 다가오는 이벤트
  const displayedEvents = useMemo(() => {
    let list = events;
    if (filterType !== "all") {
      list = list.filter((e) => e.type === filterType);
    }
    if (selectedDate) {
      const onSelected = list.filter((e) => e.date === selectedDate);
      if (onSelected.length > 0) return onSelected;
    }
    return list;
  }, [events, filterType, selectedDate]);

  // 다가오는 주요 D-Day 이벤트 (D-Day >= 0 중 가까운 5개)
  const upcomingEvents = useMemo(() => {
    return events.filter((e) => e.dday >= 0).slice(0, 5);
  }, [events]);

  return (
    <>
      <AppBar
        title="팀 일정"
        sub={team.name}
        onBack={() => router.push("/schedule")}
      />

      <Body dense>
        <ScheduleTabs current="calendar" />

        {/* 상단 월 이동 및 오늘 버튼 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h2 className="t-h2 m-0 text-txt">
              {viewYear}년 {viewMonth}월
            </h2>
            <button
              type="button"
              onClick={goToday}
              className="ml-1 rounded-lg border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-txt-muted hover:bg-fill"
            >
              오늘
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="이전 달"
              className="grid size-8 place-items-center rounded-lg border border-line bg-card text-txt hover:bg-fill active:scale-95"
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="다음 달"
              className="grid size-8 place-items-center rounded-lg border border-line bg-card text-txt hover:bg-fill active:scale-95"
            >
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        </div>

        {/* 월간 달력 패널 */}
        <Panel s="card" pad={12} r={16} className="mb-4">
          {/* 요일 헤더 */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {DAY_NAMES.map((name, i) => (
              <span
                key={name}
                className={cn(
                  "py-1 text-[12px] font-bold",
                  i === 5 ? "text-blue-600" : i === 6 ? "text-coral-700" : "text-txt-muted",
                )}
              >
                {name}
              </span>
            ))}
          </div>

          {/* 일자 그리드 */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dayEvents = eventMap[day.date] ?? [];
              const isSelected = selectedDate === day.date;
              const hasMeeting = dayEvents.some((e) => e.type === "meeting");
              const hasBox = dayEvents.some((e) => e.type === "box");
              const hasTask = dayEvents.some((e) => e.type === "task");

              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDate(day.date)}
                  className={cn(
                    "flex min-h-[50px] flex-col items-center justify-start rounded-xl p-1 transition-all text-left",
                    day.isCurrentMonth ? "text-txt" : "text-txt-faint opacity-45",
                    isSelected
                      ? "border-2 border-action bg-yellow-50 font-bold"
                      : "border border-transparent hover:bg-fill",
                    day.isToday && !isSelected && "bg-cream font-bold",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-[12px]",
                      day.isToday ? "bg-action text-on-action" : "",
                    )}
                  >
                    {day.dayNum}
                  </span>

                  {/* 이벤트 인디케이터 점들 */}
                  <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                    {hasMeeting && (
                      <span
                        title="회의"
                        className="size-1.5 rounded-full bg-yellow-400"
                      />
                    )}
                    {hasBox && (
                      <span
                        title="제출 마감"
                        className="size-1.5 rounded-full bg-coral-500"
                      />
                    )}
                    {hasTask && (
                      <span
                        title="할 일"
                        className="size-1.5 rounded-full bg-ink-400"
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        {/* 이벤트 필터 칩 */}
        <div className="mb-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors",
              filterType === "all"
                ? "bg-action text-on-action"
                : "border border-line bg-card text-txt-muted",
            )}
          >
            전체 ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("meeting")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors",
              filterType === "meeting"
                ? "bg-action text-on-action"
                : "border border-line bg-card text-txt-muted",
            )}
          >
            회의 ({events.filter((e) => e.type === "meeting").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("box")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors",
              filterType === "box"
                ? "bg-action text-on-action"
                : "border border-line bg-card text-txt-muted",
            )}
          >
            제출 마감 ({events.filter((e) => e.type === "box").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("task")}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors",
              filterType === "task"
                ? "bg-action text-on-action"
                : "border border-line bg-card text-txt-muted",
            )}
          >
            할 일 ({events.filter((e) => e.type === "task").length})
          </button>
        </div>

        {/* 선택한 날짜 일정 섹션 */}
        <div className="mb-5">
          <SecTitle
            note={
              selectedDate
                ? `${selectedDate} 일정`
                : "다가오는 주요 일정"
            }
          >
            {selectedDate === today
              ? "오늘의 일정"
              : selectedDate
                ? `${selectedDate.slice(5).replace("-", "/")} 일정`
                : "다가오는 일정"}
          </SecTitle>

          {displayedEvents.length === 0 ? (
            <Panel s="fill" pad={16} className="text-center">
              <p className="t-body text-txt-muted">
                등록된 일정이 없습니다.
              </p>
            </Panel>
          ) : (
            <Rows>
              {displayedEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  onOpenNote={
                    ev.meetingId
                      ? (meetingId, title) => setViewingNote({ meetingId, title })
                      : undefined
                  }
                />
              ))}
            </Rows>
          )}
        </div>

        {/* 다가오는 D-Day 요약 (선택 날짜가 오늘이 아닌 경우에도 한눈에 확인 가능) */}
        {selectedDate !== today && upcomingEvents.length > 0 && (
          <div className="mb-6">
            <SecTitle note="남은 일수가 적은 순">다가오는 마감 & 회의</SecTitle>
            <Rows>
              {upcomingEvents.map((ev) => (
                <EventCard
                  key={`upcoming-${ev.id}`}
                  event={ev}
                  compact
                  onOpenNote={
                    ev.meetingId
                      ? (meetingId, title) => setViewingNote({ meetingId, title })
                      : undefined
                  }
                />
              ))}
            </Rows>
          </div>
        )}

        <MeetingNoteSheet
          open={Boolean(viewingNote)}
          meetingId={viewingNote?.meetingId ?? null}
          title={viewingNote?.title}
          onClose={() => setViewingNote(null)}
        />
      </Body>
    </>
  );
}

function EventCard({
  event,
  compact = false,
  onOpenNote,
}: {
  event: CalendarEvent;
  compact?: boolean;
  onOpenNote?: (meetingId: string, title: string) => void;
}) {
  const isMeeting = event.type === "meeting";
  const isBox = event.type === "box";

  const typeLabel = isMeeting ? "회의" : isBox ? "제출함" : "할 일";
  const typeTone = isMeeting ? "ok" : isBox ? "warn" : "n";
  const ddayTone = event.dday === 0 ? "warn" : event.dday <= 3 ? "warn" : "ok";

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Chip tone={typeTone}>
            {typeLabel}
          </Chip>
          <Chip tone={ddayTone}>
            {event.ddayText}
          </Chip>
          <span className="text-[12px] font-medium text-txt-muted">
            {event.date.slice(5).replace("-", "/")}
            {event.time && ` · ${event.time}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isMeeting && event.meetingId && (
            event.hasNote ? (
              <button
                type="button"
                onClick={() => onOpenNote?.(event.meetingId!, event.title)}
                className="text-[12px] font-semibold text-brand underline cursor-pointer"
              >
                회의록 보기
              </button>
            ) : (
              <Link
                href={`/tools/clerk?meetingId=${event.meetingId}`}
                className="text-[12px] font-semibold text-txt-muted hover:text-action underline"
              >
                AI 서기 작성
              </Link>
            )
          )}
          {event.href && (
            <Link
              href={event.href}
              className="text-[12px] font-semibold text-action no-underline hover:underline"
            >
              보기 &gt;
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="t-body m-0 font-bold text-txt">{event.title}</h3>
        {event.assignee && (
          <span className="shrink-0 text-[12px] text-txt-muted">
            담당: {event.assignee}
          </span>
        )}
        {event.roleName && (
          <span className="shrink-0 text-[12px] text-txt-muted">
            역할: {event.roleName}
          </span>
        )}
      </div>

      {!compact && (event.location || event.agenda) && (
        <div className="rounded-lg bg-fill px-2.5 py-1.5 text-[12px] text-txt-muted">
          {event.location && (
            <div className="flex items-center gap-1">
              <Icon name="map-pin" size={12} />
              <span>장소: {event.location}</span>
            </div>
          )}
          {event.agenda && (
            <div className="flex items-center gap-1">
              <Icon name="file-text" size={12} />
              <span>안건: {event.agenda}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
