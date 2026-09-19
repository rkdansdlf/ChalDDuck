"use server";

import { revalidatePath } from "next/cache";
import { dmThreadKey } from "@/data/api";
import { db } from "@/server/db";
import { requireSessionMember } from "@/server/session";

/**
 * 채팅 서버 액션.
 *
 * `threadId` 는 "team" 또는 상대 팀원의 id 다. DM 방 키는 **서버에서** 만든다 —
 * 화면이 보낸 키를 그대로 쓰면 남의 대화방에 글을 넣을 수 있다.
 */
async function resolveThread(threadId: string, meId: string, teamId: string) {
  if (threadId === "team") return "team";

  const other = await db.member.findFirst({ where: { id: threadId, teamId } });
  if (!other) throw new Error("대화 상대를 찾을 수 없습니다.");
  return dmThreadKey(meId, other.id);
}

/** 화면에 보일 시각 문자열. 서버가 포맷해야 사람마다 다르게 보이지 않는다. */
function nowLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

export async function sendChatMessage(threadId: string, text: string): Promise<{ ok: boolean }> {
  const me = await requireSessionMember();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false };

  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  await db.message.create({
    data: {
      teamId: me.teamId,
      threadKey,
      authorId: me.id,
      text: trimmed,
      whenLabel: nowLabel(),
    },
  });

  revalidatePath("/chat", "layout");
  return { ok: true };
}

/** 대화를 열었으면 읽은 것이다 — 목록과 탭 배지의 안 읽음 수가 함께 내려간다. */
export async function markThreadRead(threadId: string): Promise<void> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  await db.readMark.upsert({
    where: { memberId_threadKey: { memberId: me.id, threadKey } },
    update: { readAt: new Date() },
    create: { memberId: me.id, threadKey },
  });

  revalidatePath("/chat", "layout");
}
