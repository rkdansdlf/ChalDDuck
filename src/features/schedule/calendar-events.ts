import { todayInSeoul } from "./week";
import type { CalendarEvent, CalendarEventType } from "@/lib/types";

/**
 * 한국 날짜 "YYYY-MM-DD" 기준 D-Day 계산.
 *
 * @param eventDate "YYYY-MM-DD"
 * @param todayDate "YYYY-MM-DD" (생략 시 한국 현재 날짜)
 */
export function calcDday(
  eventDate: string,
  todayDate: string = todayInSeoul(),
): { dday: number; ddayText: string } {
  const [ey, em, ed] = eventDate.split("-").map(Number);
  const [ty, tm, td] = todayDate.split("-").map(Number);

  const eventTime = Date.UTC(ey, em - 1, ed);
  const todayTime = Date.UTC(ty, tm - 1, td);
  const diffDays = Math.round((eventTime - todayTime) / (24 * 60 * 60 * 1000));

  let ddayText = "";
  if (diffDays === 0) {
    ddayText = "D-Day";
  } else if (diffDays > 0) {
    ddayText = `D-${diffDays}`;
  } else {
    ddayText = `D+${Math.abs(diffDays)}`;
  }

  return { dday: diffDays, ddayText };
}

/**
 * Task.due 문자열("10/12", "10/5", "2026-10-12")을 "YYYY-MM-DD" 로 정규화.
 */
export function normalizeTaskDueDate(
  due: string | null | undefined,
  currentYear: number = new Date().getFullYear(),
): string | null {
  if (!due) return null;
  const trimmed = due.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const month = match[1].padStart(2, "0");
    const day = match[2].padStart(2, "0");
    return `${currentYear}-${month}-${day}`;
  }
  return null;
}

/** 날짜별 이벤트 그룹핑 */
export function groupEventsByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const map: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    if (!map[ev.date]) {
      map[ev.date] = [];
    }
    map[ev.date].push(ev);
  }
  return map;
}

/** 이벤트 정렬: 날짜 오름차순 -> D-Day 오름차순 -> 타입 우선순위(회의 > 마감 > 할일) */
export function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  const typePriority: Record<CalendarEventType, number> = {
    meeting: 1,
    box: 2,
    task: 3,
  };

  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const pA = typePriority[a.type] ?? 99;
    const pB = typePriority[b.type] ?? 99;
    if (pA !== pB) return pA - pB;
    return a.title.localeCompare(b.title);
  });
}
