import { calcDday, normalizeTaskDueDate, sortCalendarEvents, groupEventsByDate } from "../src/features/schedule/calendar-events.js";
import { generateIcsContent, generateGoogleCalendarUrl } from "../src/features/schedule/calendar-export.js";
import { parseTimetableText, parseIcsTimetable } from "../src/features/schedule/timetable-parser.js";
import type { CalendarEvent } from "../src/lib/types.js";

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    console.error(`✗ ${name}`, extra ?? "");
  }
}

console.log("=== 1. Calendar Events & D-Day 테스트 ===");
{
  const today = "2026-10-03";
  const res1 = calcDday("2026-10-03", today);
  assert("오늘 D-Day", res1.dday === 0 && res1.ddayText === "D-Day");

  const res2 = calcDday("2026-10-06", today);
  assert("3일 후 D-3", res2.dday === 3 && res2.ddayText === "D-3");

  const res3 = calcDday("2026-10-01", today);
  assert("2일 전 D+2", res3.dday === -2 && res3.ddayText === "D+2");

  assert("Task.due 정규화 10/15 -> 2026-10-15", normalizeTaskDueDate("10/15", 2026) === "2026-10-15");
  assert("Task.due 정규화 9/5 -> 2026-09-05", normalizeTaskDueDate("9/5", 2026) === "2026-09-05");
  assert("Task.due 정규화 YYYY-MM-DD 유지", normalizeTaskDueDate("2026-11-01", 2026) === "2026-11-01");
  assert("Task.due null/empty 처리", normalizeTaskDueDate(null, 2026) === null);

  const mockEvents: CalendarEvent[] = [
    { id: "1", type: "task", title: "발표자료 준비", date: "2026-10-05", time: null, dday: 2, ddayText: "D-2" },
    { id: "2", type: "meeting", title: "정기 회의", date: "2026-10-05", time: "16:00 – 17:00", dday: 2, ddayText: "D-2" },
    { id: "3", type: "box", title: "제출 마감", date: "2026-10-04", time: "23:59", dday: 1, ddayText: "D-1" },
  ];

  const sorted = sortCalendarEvents(mockEvents);
  assert("날짜순 정렬 후 10-04가 첫번째", sorted[0].id === "3");
  assert("동일 날짜에서 회의가 할 일보다 우선", sorted[1].id === "2" && sorted[2].id === "1");

  const grouped = groupEventsByDate(mockEvents);
  assert("날짜별 그룹핑 확인", grouped["2026-10-05"]?.length === 2 && grouped["2026-10-04"]?.length === 1);
}

console.log("\n=== 2. Calendar Export (ICS & Google) 테스트 ===");
{
  const testMeeting = {
    title: "찰떡 팀 1차 회의",
    date: "2026-10-07",
    time: "14:00 – 15:30",
    durationMinutes: 90,
    location: "중앙도서관 세미나실 3호",
    agenda: "중간발표 역할분담 및 PPT 구성 협의",
  };

  const ics = generateIcsContent(testMeeting);
  assert("ICS BEGIN/END VCALENDAR 포함", ics.includes("BEGIN:VCALENDAR") && ics.includes("END:VCALENDAR"));
  assert("ICS SUMMARY 포함", ics.includes("SUMMARY:찰떡 팀 1차 회의"));
  assert("ICS LOCATION 포함", ics.includes("LOCATION:중앙도서관 세미나실 3호"));
  assert("ICS DESCRIPTION 안건 포함", ics.includes("안건: 중간발표 역할분담 및 PPT 구성 협의"));

  const gCalUrl = generateGoogleCalendarUrl(testMeeting);
  assert("Google Calendar URL 시작", gCalUrl.startsWith("https://calendar.google.com/calendar/render?"));
  assert("Google Calendar 텍스트 파라미터 인코딩", gCalUrl.includes("text=%EC%B0%B0%EB%96%A1"));
  assert("Google Calendar 장소 파라미터 포함", gCalUrl.includes("location="));
}

console.log("\n=== 3. Timetable Parser (에브리타임/텍스트/ICS) 테스트 ===");
{
  const sampleEverytimeText = `
자료구조 월 10:00-12:00
알고리즘 화 14:00~16:00
운영체제 목 13:00 - 15:00
소프트웨어공학 금 3,4교시
`;

  const parsed = parseTimetableText(sampleEverytimeText);
  assert("에브리타임 텍스트 4개 수업 파싱", parsed.blocks.length === 4);
  assert("월요일 10시 자료구조 (day=0, startHour=1, hours=2)", 
    parsed.blocks[0].day === 0 && 
    parsed.blocks[0].startHour === 1 && 
    parsed.blocks[0].hours === 2 && 
    parsed.blocks[0].label === "자료구조"
  );
  assert("화요일 14시 알고리즘 (day=1, startHour=5, hours=2)",
    parsed.blocks[1].day === 1 && 
    parsed.blocks[1].startHour === 5 && 
    parsed.blocks[1].hours === 2 && 
    parsed.blocks[1].label === "알고리즘"
  );
  assert("금요일 교시 파싱 (day=4, startHour=2, hours=2)",
    parsed.blocks[3].day === 4 &&
    parsed.blocks[3].hours === 2 &&
    parsed.blocks[3].label === "소프트웨어공학"
  );

  const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//KO
BEGIN:VEVENT
SUMMARY:컴퓨터네트워크
DTSTART:20260901T150000
DTEND:20260901T170000
RRULE:FREQ=WEEKLY;BYDAY=WE
END:VEVENT
END:VCALENDAR`;

  const icsParsed = parseIcsTimetable(sampleIcs);
  assert("ICS 수업 파싱 1개", icsParsed.blocks.length === 1);
  assert("수요일 15시 컴퓨터네트워크 (day=2, startHour=6, hours=2)",
    icsParsed.blocks[0].day === 2 &&
    icsParsed.blocks[0].startHour === 6 &&
    icsParsed.blocks[0].hours === 2 &&
    icsParsed.blocks[0].label === "컴퓨터네트워크"
  );
}

console.log(`\n결과: ${passed}건 통과, ${failed}건 실패`);
if (failed > 0) process.exit(1);
