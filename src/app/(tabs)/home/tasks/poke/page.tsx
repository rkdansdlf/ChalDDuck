import { getCurrentTeam, getMyPokedTaskIds, getTasks } from "@/data/api";
import { PokeScreen } from "@/features/tasks/poke-screen";

/**
 * 24 익명 콕 찌르기.
 *
 * "오늘 이미 보냈는지"는 날짜가 바뀌면 달라진다. 빌드 시점에 굳으면 어제 보낸 것이
 * 오늘도 잠겨 보이므로 요청마다 렌더한다.
 */
export const dynamic = "force-dynamic";

export default async function PokePage() {
  const team = await getCurrentTeam();
  const [tasks, poked] = await Promise.all([getTasks(team.id), getMyPokedTaskIds(team.id)]);
  return <PokeScreen tasks={tasks} poked={poked} />;
}
