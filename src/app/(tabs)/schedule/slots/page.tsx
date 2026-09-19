import { getCurrentTeam, getMeetingProposal, getMeetingWeek } from "@/data/api";
import { SlotsScreen } from "@/features/schedule/slots-screen";

/**
 * 09 회의 시간 추천 / 10 전원 불가한 주.
 *
 * 두 화면은 같은 라우트의 두 상태다 — 전원 가능한 후보가 없으면 10번 흐름으로 보인다.
 * `?preview=none` 은 전원 불가한 주를 확인하기 위한 데모용 스위치다.
 *
 * 마감 시각이 지났는지를 요청 시점에 따지므로(`effectiveStage`) 요청마다 렌더한다 —
 * 빌드 때 굳으면 지나간 마감이 계속 "대기 중"으로 보인다.
 */
export const dynamic = "force-dynamic";

export default async function SlotsPage({ searchParams }: PageProps<"/schedule/slots">) {
  const { preview } = await searchParams;
  const asNone = preview === "none" ? "none" : undefined;

  const team = await getCurrentTeam();
  const [week, proposal] = await Promise.all([
    getMeetingWeek(team.id, asNone),
    getMeetingProposal(team.id),
  ]);

  return (
    <SlotsScreen
      team={team}
      week={week}
      proposal={proposal}
      preview={asNone}
      // 24시간을 기다리지 않고 마감 뒤 화면을 보는 버튼. 배포본에는 없다.
      devDemo={process.env.NODE_ENV !== "production"}
    />
  );
}
