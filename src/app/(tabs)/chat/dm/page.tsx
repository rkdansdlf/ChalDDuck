import { getCurrentTeam, getDmThreads } from "@/data/api";
import { ChatEmptyPane, NarrowOnly, WideOnly } from "@/features/chat/chat-panes";
import { DmListScreen } from "@/features/chat/dm-list-screen";

/**
 * 30 1:1 DM 목록.
 *
 * 넓은 화면에서는 이 목록이 왼쪽 기둥에 이미 있으므로 가운데에 다시 그리지 않는다.
 */
export default async function DmListPage() {
  const team = await getCurrentTeam();
  const threads = await getDmThreads(team.id);

  return (
    <>
      <NarrowOnly>
        <DmListScreen threads={threads} />
      </NarrowOnly>
      <WideOnly>
        <ChatEmptyPane />
      </WideOnly>
    </>
  );
}
