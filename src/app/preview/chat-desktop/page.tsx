import { getDemoTeam, getDmThreads, getRecentItems, getTeamMessages } from "@/data/api";
import { ChatDesktopPreview } from "@/features/chat/chat-desktop-preview";

/**
 * 33 채팅 · PC 화면 기준.
 *
 * 탭 셸(390px 기기 프레임) 밖에 둔다 — 전체 폭을 써야 하는 화면이라서다.
 * 사용자 경로가 아니라 디자인 기준 페이지이므로 앱 안에서 링크하지 않는다.
 */
export const metadata = { title: "채팅 PC 화면 기준 · 찰떡" };

export default async function ChatDesktopPreviewPage() {
  const team = await getDemoTeam();
  const [messages, threads, recent] = await Promise.all([
    getTeamMessages(team.id),
    getDmThreads(team.id),
    getRecentItems(team.id),
  ]);

  return <ChatDesktopPreview team={team} messages={messages} threads={threads} recent={recent} />;
}
