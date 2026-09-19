import { getIceGames } from "@/data/api";
import { IceBreakScreen } from "@/features/social/icebreak-screen";

/** 28 아이스브레이킹. */
export default async function IceBreakPage() {
  const games = await getIceGames();
  return <IceBreakScreen games={games} />;
}
