import { getAiStatus, getClerkSample, getCurrentTeam, getMeetingProposalById, getRoster } from "@/data/api";
import { ClerkScreen } from "@/features/tools/clerk-screen";

/** 20 AI 서기. */
export default async function ClerkPage({
  searchParams,
}: {
  searchParams: Promise<{ meetingId?: string }>;
}) {
  const { meetingId } = await searchParams;
  const team = await getCurrentTeam();
  const [sample, roster, ai, meeting] = await Promise.all([
    getClerkSample(),
    getRoster(team.id),
    getAiStatus(),
    meetingId ? getMeetingProposalById(team.id, meetingId) : Promise.resolve(null),
  ]);

  return (
    <ClerkScreen
      sample={sample}
      roster={roster}
      aiReady={ai.connected}
      meeting={meeting}
    />
  );
}
