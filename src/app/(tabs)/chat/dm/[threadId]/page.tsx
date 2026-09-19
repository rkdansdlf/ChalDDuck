import { notFound } from "next/navigation";
import { getCurrentTeam, getDmMessages, getDmThread, getRoster } from "@/data/api";
import { DmScreen } from "@/features/chat/dm-screen";

/** 31 1:1 DM 대화. */
export default async function DmPage({ params }: PageProps<"/chat/dm/[threadId]">) {
  const { threadId } = await params;
  const team = await getCurrentTeam();
  const thread = await getDmThread(team.id, threadId);
  if (!thread) notFound();

  const [messages, roster] = await Promise.all([
    getDmMessages(team.id, threadId),
    getRoster(team.id),
  ]);

  return <DmScreen thread={thread} messages={messages} me={roster.find((m) => m.isMe)} />;
}
