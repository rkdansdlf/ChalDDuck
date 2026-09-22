import { getCurrentTeam, getDmThreads, getTeamMessages } from "@/data/api";
import { ChatEmptyPane, NarrowOnly, WideOnly } from "@/features/chat/chat-panes";
import { ChatHubScreen } from "@/features/chat/chat-hub-screen";

/**
 * 채팅 탭 — 32 채팅 (통합 목록).
 *
 * 좁은 화면에서는 이 화면이 목록 그 자체다. 넓은 화면에서는 목록이 왼쪽 기둥으로 빠져 있으므로
 * 가운데에 같은 목록을 한 번 더 그리지 않고 "대화를 고르세요"만 둔다.
 */
export default async function ChatPage() {
  const team = await getCurrentTeam();
  const [teamMessages, threads] = await Promise.all([
    getTeamMessages(team.id),
    getDmThreads(team.id),
  ]);

  return (
    <>
      <NarrowOnly>
        <ChatHubScreen team={team} teamMessages={teamMessages.messages} threads={threads} />
      </NarrowOnly>
      <WideOnly>
        <ChatEmptyPane />
      </WideOnly>
    </>
  );
}
