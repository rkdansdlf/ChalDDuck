import { getCurrentTeam, getMeetingWeek } from "@/data/api";
import { SlotsScreen } from "@/features/schedule/slots-screen";

/**
 * 09 회의 시간 추천 / 10 전원 불가한 주.
 *
 * 두 화면은 같은 라우트의 두 상태다 — 전원 가능한 후보가 없으면 10번 흐름으로 보인다.
 * `?preview=none` 은 서버가 없는 동안 10번 상태를 확인하기 위한 데모용 스위치다.
 */
export default async function SlotsPage({ searchParams }: PageProps<"/schedule/slots">) {
  const { preview } = await searchParams;
  const asNone = preview === "none" ? "none" : undefined;

  const team = await getCurrentTeam();
  const week = await getMeetingWeek(team.id, asNone);

  return <SlotsScreen team={team} week={week} preview={asNone} />;
}
