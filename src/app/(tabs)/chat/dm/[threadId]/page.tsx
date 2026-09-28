import { notFound } from "next/navigation";
import { CUSHION_LEVELS, CUSHION_TONES } from "@/data/catalog";
import { getCurrentTeam, getDmMessages, getDmReadCushion, getDmThread, getRoster } from "@/data/api";
import { DmScreen } from "@/features/chat/dm-screen";

/** 31 1:1 DM 대화. */
export default async function DmPage({ params }: PageProps<"/chat/dm/[threadId]">) {
  const { threadId } = await params;
  const team = await getCurrentTeam();
  const thread = await getDmThread(team.id, threadId);
  if (!thread) notFound();

  const [page, roster, cushion] = await Promise.all([
    getDmMessages(team.id, threadId),
    getRoster(team.id),
    // 읽기 순화는 **이 대화만** 해당한다 — 단톡방에서의 선택을 그대로 물려받지 않는다.
    getDmReadCushion(team.id, threadId),
  ]);

  return (
    <DmScreen
      thread={thread}
      messages={page.messages}
      initialCursor={page.nextCursor}
      me={roster.find((m) => m.isMe)}
      tones={CUSHION_TONES}
      levels={CUSHION_LEVELS}
      cushion={cushion}
    />
  );
}
