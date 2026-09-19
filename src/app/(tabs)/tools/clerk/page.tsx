import { getClerkSample, getCurrentTeam, getRoster } from "@/data/api";
import { ClerkScreen } from "@/features/tools/clerk-screen";

/** 20 AI 서기. */
export default async function ClerkPage() {
  const team = await getCurrentTeam();
  const [sample, roster] = await Promise.all([getClerkSample(), getRoster(team.id)]);
  return <ClerkScreen sample={sample} roster={roster} />;
}
