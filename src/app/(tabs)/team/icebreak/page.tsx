import { getIceGames, getIceView } from "@/data/api";
import { IceBreakScreen } from "@/features/social/icebreak-screen";

/** 28 아이스브레이킹. */
export default async function IceBreakPage() {
  const [games, view] = await Promise.all([getIceGames(), getIceView()]);
  return <IceBreakScreen games={games} initial={view} />;
}
