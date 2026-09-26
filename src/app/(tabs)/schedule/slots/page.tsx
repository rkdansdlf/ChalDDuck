import { getCurrentTeam, getMeetingProposal, getMeetingWeek } from "@/data/api";
import { SlotsScreen } from "@/features/schedule/slots-screen";
import { refreshStaleCandidates } from "@/server/meetings/candidates";

/**
 * 09 회의 시간 추천 / 10 전원 불가한 주.
 *
 * 두 화면은 같은 라우트의 두 상태다 — 전원 가능한 후보가 없으면 10번 흐름으로 보인다.
 * 후보를 실제 시간표에서 계산하게 되면서 데모용 `?preview=none` 스위치는 없앴다.
 *
 * 마감 시각이 지났는지를 요청 시점에 따지므로(`effectiveStage`) 요청마다 렌더한다 —
 * 빌드 때 굳으면 지나간 마감이 계속 "대기 중"으로 보인다.
 */
export const dynamic = "force-dynamic";

export default async function SlotsPage() {
  const team = await getCurrentTeam();
  // 주가 바뀌었으면 후보를 새 주의 시간표로 다시 만든 뒤 읽는다.
  await refreshStaleCandidates(team.id);
  const [week, proposal] = await Promise.all([
    getMeetingWeek(team.id),
    getMeetingProposal(team.id),
  ]);

  return (
    <SlotsScreen
      team={team}
      week={week}
      proposal={proposal}
      // 24시간을 기다리지 않고 마감 뒤 화면을 보는 버튼. 배포본에는 없다.
      devDemo={process.env.NODE_ENV !== "production"}
    />
  );
}
