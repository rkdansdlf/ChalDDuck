import { getCurrentTeam, getTeamCalendarEvents } from "@/data/api";
import { CalendarScreen } from "@/features/schedule/calendar-screen";

/**
 * 일정 탭 — 팀 전체 일정 (통합 캘린더 & 마감 일정).
 *
 * 확정된 회의·제안된 회의, 팀 할 일 마감, 제출함 마감을 한 달력에서
 * 종합적으로 조망한다.
 */
export const dynamic = "force-dynamic";

export default async function ScheduleCalendarPage() {
  const team = await getCurrentTeam();
  const events = await getTeamCalendarEvents(team.id);

  return <CalendarScreen team={team} events={events} />;
}
