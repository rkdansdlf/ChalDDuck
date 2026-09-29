import { getCurrentTeam, getDmThreads, getRecentItems, getTeamMessages } from "@/data/api";
import { ChatInfoPane } from "@/features/chat/chat-info-pane";
import { ChatThreadList } from "@/features/chat/chat-thread-list";

/**
 * 채팅 3분할.
 *
 * 넓은 화면에서는 목록을 옆에 두고 대화만 바꾼다 — 대화를 옮길 때마다 목록이 사라졌다
 * 나타나면 어디에 있었는지 감각을 잃는다.
 *
 * - ~1023px: 기둥이 모두 숨고 화면이 한 번에 하나씩 넘어간다(32 → 19 / 31).
 * - 1024px~: 목록 + 대화.
 * - 1280px~: 목록 + 대화 + 최근 팀 자료·업무. 1024px 에서 세 기둥을 다 펴면 대화 칸이
 *   말풍선 한 줄도 못 담을 만큼 좁아진다(왼쪽 앱 내비게이션이 232px 을 이미 쓴다).
 *
 * 오른쪽 기둥은 **이 대화의 자료가 아니다** — 팀 전체의 최근 항목이라(자세한 것은
 * `features/chat/chat-info-pane.tsx` 참고), 문구도 그 사실대로 적혀 있다.
 */
export default async function ChatLayout({ children }: LayoutProps<"/chat">) {
  const team = await getCurrentTeam();
  const [teamMessages, threads, recent] = await Promise.all([
    getTeamMessages(team.id),
    getDmThreads(team.id),
    getRecentItems(team.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[280px] flex-none border-r border-line bg-card lg:flex lg:flex-col">
        <ChatThreadList
          team={team}
          teamMessages={teamMessages.messages}
          threads={threads}
          variant="pane"
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">{children}</div>

      <aside className="hidden w-[260px] flex-none border-l border-line bg-card xl:flex xl:flex-col">
        <ChatInfoPane recent={recent} />
      </aside>
    </div>
  );
}
