import { getDemoTeam, getRoster, getTeamMessages } from "@/data/api";
import { TeamChatScreen } from "@/features/chat/team-chat-screen";

/** 19 팀플 단톡방. */
export default async function TeamChatPage() {
  const team = await getDemoTeam();
  const [messages, roster] = await Promise.all([getTeamMessages(team.id), getRoster(team.id)]);

  return <TeamChatScreen team={team} messages={messages} me={roster.find((m) => m.isMe)} />;
}
