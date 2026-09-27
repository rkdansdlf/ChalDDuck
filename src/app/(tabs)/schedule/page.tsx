import { getCurrentTeam, getMeetingProposal, getMyBusyBlocks, getScheduleOptions } from "@/data/api";
import { MyTimeScreen } from "@/features/schedule/my-time-screen";

/**
 * 일정 탭 — 08 내 가능한 시간.
 *
 * 요청마다 그려진다 — 확정·제안된 회의를 격자에 얹는데, 그 상태는 **응답 마감이 지나면
 * 저절로 바뀐다**(마감은 아무도 저장하지 않아도 온다). 빌드 때 굳으면 지나간 마감의 회의가
 * "제안됨"으로 오래 남는다.
 */
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const team = await getCurrentTeam();
  const [{ kinds, customKind, days, hours, weeks, candidateDays }, blocks, meeting] =
    await Promise.all([
      getScheduleOptions(),
      getMyBusyBlocks(team.id),
      getMeetingProposal(team.id),
    ]);

  return (
    <MyTimeScreen
      kinds={kinds}
      customKind={customKind}
      days={days}
      hours={hours}
      weeks={weeks}
      candidateDays={candidateDays}
      meeting={meeting}
      initialBlocks={blocks}
    />
  );
}
