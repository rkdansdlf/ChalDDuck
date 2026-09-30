import { getIceGames, getIceRoster, getIceView } from "@/data/api";
import { IceBreakScreen } from "@/features/social/icebreak-screen";

/** 28 아이스브레이킹. */
export default async function IceBreakPage() {
  const [games, view, roster] = await Promise.all([getIceGames(), getIceView(), getIceRoster()]);
  return <IceBreakScreen games={games} initial={view} roster={roster} />;
}