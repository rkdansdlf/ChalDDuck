/**
 * 캘린더 내보내기 유틸리티 (Google Calendar 링크 & .ics 파일 생성).
 *
 * RFC 5545 표준 iCalendar 포맷을 준수합니다.
 */

export type CalendarExportable = {
  title: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "16:00 – 18:00" 또는 "16:00" */
  time?: string | null;
  /** 회의 길이(분 단위). 기본 60분. */
  durationMinutes?: number;
  location?: string | null;
  agenda?: string | null;
};

/** 시작 시간과 종료 시간을 Date(KST 기준) 객체로 파싱 */
function parseEventTimes(
  date: string,
  time?: string | null,
  durationMinutes: number = 60,
): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);

  let startHour = 10;
  let startMinute = 0;

  if (time) {
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (match) {
      startHour = Number(match[1]);
      startMinute = Number(match[2]);
    }
  }

  // KST (UTC+9) 날짜를 UTC 밀리초로 계산
  const startUtcMs = Date.UTC(y, m - 1, d, startHour - 9, startMinute);
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + durationMinutes * 60 * 1000);

  return { start, end };
}

/** Date 객체를 iCalendar UTC 포맷 문자열로 변환 ("YYYYMMDDTHHmmssZ") */
function toIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * .ics (iCalendar RFC 5545) 텍스트 파일 내용 생성
 */
export function generateIcsContent(event: CalendarExportable): string {
  const { start, end } = parseEventTimes(
    event.date,
    event.time,
    event.durationMinutes ?? 60,
  );

  const uid = `chaldduck-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@chaldduck.app`;
  const dtStamp = toIcsUtc(new Date());
  const dtStart = toIcsUtc(start);
  const dtEnd = toIcsUtc(end);

  const summary = event.title.replace(/\n/g, " ");
  const description = [
    event.agenda ? `안건: ${event.agenda}` : "",
    "찰떡 팀 프로젝트에서 확정된 회의 일정입니다.",
  ]
    .filter(Boolean)
    .join("\\n")
    .replace(/\n/g, "\\n");

  const location = (event.location ?? "").replace(/\n/g, " ");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ChalDduck//Team Schedule//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : "",
    location ? `LOCATION:${location}` : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/**
 * 브라우저에서 .ics 파일 다운로드 트리거
 */
export function downloadIcsFile(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Google Calendar 이벤트 생성 Web URL 생성
 */
export function generateGoogleCalendarUrl(event: CalendarExportable): string {
  const { start, end } = parseEventTimes(
    event.date,
    event.time,
    event.durationMinutes ?? 60,
  );

  const dtStart = toIcsUtc(start);
  const dtEnd = toIcsUtc(end);

  const details = [
    event.agenda ? `안건: ${event.agenda}` : "",
    "찰떡 팀 프로젝트 확정 회의",
  ]
    .filter(Boolean)
    .join("\n");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${dtStart}/${dtEnd}`,
    details,
  });

  if (event.location) {
    params.set("location", event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
