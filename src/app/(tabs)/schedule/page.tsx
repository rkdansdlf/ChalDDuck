import { getDemoTeam, getMyBusyBlocks, getScheduleOptions } from "@/data/api";
import { MyTimeScreen } from "@/features/schedule/my-time-screen";

/** 일정 탭 — 08 내 가능한 시간. */
export default async function SchedulePage() {
  const team = await getDemoTeam();
  const [{ kinds, days, hours }, blocks] = await Promise.all([
    getScheduleOptions(),
    getMyBusyBlocks(team.id),
  ]);

  return (
    <MyTimeScreen team={team} kinds={kinds} days={days} hours={hours} initialBlocks={blocks} />
  );
}
