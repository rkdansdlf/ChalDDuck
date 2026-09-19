import { getDemoTeam, getDmThreads, getTeamMessages } from "@/data/api";
import { ChatHubScreen } from "@/features/chat/chat-hub-screen";

/** 채팅 탭 — 32 채팅 (통합 목록). */
export default async function ChatPage() {
  const team = await getDemoTeam();
  const [teamMessages, threads] = await Promise.all([
    getTeamMessages(team.id),
    getDmThreads(team.id),
  ]);

  return <ChatHubScreen team={team} teamMessages={teamMessages} threads={threads} />;
}
