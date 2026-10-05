import { SCHEDULE_HOURS } from "@/data/catalog";
import type { BusyKindKey } from "@/lib/types";

export type ParsedTimeBlock = {
  day: number; // 0 = 월 ... 6 = 일
  startHour: number; // SCHEDULE_HOURS index (0 = 9시, 1 = 10시 ...)
  hours: number; // 기간 (시간)
  kind: BusyKindKey;
  label: string;
};

const DAY_MAP: Record<string, number> = {
  월: 0,
  화: 1,
  수: 2,
  목: 3,
  금: 4,
  토: 5,
  일: 6,
  월요일: 0,
  화요일: 1,
  수요일: 2,
  목요일: 3,
  금요일: 4,
  토요일: 5,
  일요일: 6,
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

/**
 * 24시간 형식의 시간("09:00", "9", "13:30")을 SCHEDULE_HOURS 인덱스로 변환.
 * SCHEDULE_HOURS 는 ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23"]
 */
function hourToIndex(hourNum: number): number {
  const baseHour = 9; // 첫 시간 09시
  const idx = hourNum - baseHour;
  if (idx < 0) return 0;
  if (idx >= SCHEDULE_HOURS.length) return SCHEDULE_HOURS.length - 1;
  return idx;
}

/**
 * 대학교 교시(1교시 = 9시, 2교시 = 10시 등)를 SCHEDULE_HOURS 인덱스로 변환
 */
function periodToIndex(period: number): number {
  return hourToIndex(period + 8);
}

/**
 * 에브리타임 텍스트 또는 일반 시간표 텍스트 파싱
 *
 * 지원 포맷:
 * 1. "과목명 요일 시작시간-종료시간" (예: "자료구조 월 10:00-12:00", "알고리즘 화 14:00~16:00")
 * 2. "요일 시작시간-종료시간 과목명" (예: "수 13:00 - 15:00 컴퓨터네트워크")
 * 3. 에브리타임 교시 포맷 (예: "소프트웨어공학 월3,4 목3,4" 또는 "데이터베이스 화(10:00~11:30)")
 */
export function parseTimetableText(text: string): {
  blocks: ParsedTimeBlock[];
  errors: string[];
} {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const blocks: ParsedTimeBlock[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    let matched = false;

    // 포맷 A: "월 10:00-12:00", "월 10:00 ~ 12:00 과목명" 등
    // 정규식: (요일) ... (시간)-(시간)
    const timeMatch = line.match(
      /(월|화|수|목|금|토|일)(?:요일)?\s*\(?(\d{1,2})(?::(\d{2}))?\s*[-~–]\s*(\d{1,2})(?::(\d{2}))?\)?/i,
    );

    if (timeMatch) {
      const dayStr = timeMatch[1];
      const startH = Number(timeMatch[2]);
      const endH = Number(timeMatch[4]);
      const day = DAY_MAP[dayStr];

      // 과목명 추출 (시간 표현 앞이나 뒤의 텍스트)
      const cleanLine = line.replace(timeMatch[0], "").trim();
      const label = cleanLine.split(/\s+/)[0] || "수업";

      if (day !== undefined && endH > startH) {
        const startHourIdx = hourToIndex(startH);
        const endHourIdx = hourToIndex(endH);
        const hours = Math.max(1, endHourIdx - startHourIdx);

        blocks.push({
          day,
          startHour: startHourIdx,
          hours,
          kind: "class",
          label: label.slice(0, 30),
        });
        matched = true;
      }
    }

    // 포맷 B: 에브리타임 복사 포맷 ("과목명\t교수명\t월 1, 2, 3")
    if (!matched) {
      const periodMatch = line.match(
        /(월|화|수|목|금|토|일)(?:요일)?\s*([0-9,\s]+)교시?/i,
      );
      if (periodMatch) {
        const dayStr = periodMatch[1];
        const periods = periodMatch[2]
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => !Number.isNaN(n) && n > 0);

        if (periods.length > 0) {
          const day = DAY_MAP[dayStr];
          const minPeriod = Math.min(...periods);
          const maxPeriod = Math.max(...periods);
          const startHourIdx = periodToIndex(minPeriod);
          const hours = maxPeriod - minPeriod + 1;

          const cleanLine = line.replace(periodMatch[0], "").trim();
          const label = cleanLine.split(/\s+/)[0] || "수업";

          blocks.push({
            day,
            startHour: startHourIdx,
            hours,
            kind: "class",
            label: label.slice(0, 30),
          });
          matched = true;
        }
      }
    }

    if (!matched && line.length > 4) {
      errors.push(`인식하지 못한 줄: "${line}"`);
    }
  }

  return { blocks, errors };
}

/**
 * 에브리타임 또는 대학 포털 iCalendar (.ics) 파일 파싱
 */
export function parseIcsTimetable(icsContent: string): {
  blocks: ParsedTimeBlock[];
  errors: string[];
} {
  const blocks: ParsedTimeBlock[] = [];
  const errors: string[] = [];

  const events = icsContent.split("BEGIN:VEVENT");
  events.shift(); // 첫 머리말 제거

  for (const ev of events) {
    const summaryMatch = ev.match(/SUMMARY:(.+?)(?:\r?\n|$)/i);
    const dtStartMatch = ev.match(/DTSTART(?:;[^:]+)?:(\d{8}T\d{4,6}|\d{8})/i);
    const dtEndMatch = ev.match(/DTEND(?:;[^:]+)?:(\d{8}T\d{4,6}|\d{8})/i);
    const rruleMatch = ev.match(/RRULE:[^\r\n]*BYDAY=([A-Z,]+)/i);

    const title = summaryMatch ? summaryMatch[1].trim() : "수업";

    if (dtStartMatch) {
      const dtStart = dtStartMatch[1];
      const dtEnd = dtEndMatch ? dtEndMatch[1] : null;

      // 시간 파싱 ("T090000" or "T0900")
      let startH = 9;
      let endH = 10;

      if (dtStart.includes("T")) {
        const tPart = dtStart.split("T")[1];
        startH = Number(tPart.slice(0, 2));
      }
      if (dtEnd && dtEnd.includes("T")) {
        const tPart = dtEnd.split("T")[1];
        endH = Number(tPart.slice(0, 2));
      }

      // 요일 파싱 (RRULE BYDAY 또는 DTSTART 날짜)
      const days: number[] = [];
      if (rruleMatch) {
        const byDays = rruleMatch[1].split(",");
        for (const bd of byDays) {
          const d = DAY_MAP[bd.trim()];
          if (d !== undefined) days.push(d);
        }
      } else {
        const dateStr = dtStart.slice(0, 8);
        const y = Number(dateStr.slice(0, 4));
        const m = Number(dateStr.slice(4, 6));
        const d = Number(dateStr.slice(6, 8));
        const dt = new Date(Date.UTC(y, m - 1, d));
        const weekday = (dt.getUTCDay() + 6) % 7; // 월=0
        days.push(weekday);
      }

      for (const day of days) {
        const startHourIdx = hourToIndex(startH);
        const hours = Math.max(1, endH - startH);

        blocks.push({
          day,
          startHour: startHourIdx,
          hours,
          kind: "class",
          label: title.slice(0, 30),
        });
      }
    }
  }

  return { blocks, errors };
}
