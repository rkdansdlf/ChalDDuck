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

/**
 * 한 번에 보낼 수 있는 길이.
 *
 * 입력줄이 `maxLength` 로 먼저 막지만 **서버도 막아야 한다** — 서버 액션은 화면을 거치지
 * 않고 POST 로 바로 불릴 수 있어서, 화면에서 막은 것은 막은 것이 아니다.
 *
 * 자르지 않고 거절한다. 다른 액션(할 일 제목 등)은 넘는 만큼 잘라 내지만, 대화는 잘린
 * 줄을 보낸 사람이 뭘 썼는지 모른 채 보내게 된다. 거절하면 말풍선이 "보내지 못함"으로
 * 남아 원문이 그대로 손에 있다.
 */
const MAX_MESSAGE = 2000;

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
  if (trimmed.length > MAX_MESSAGE) return { ok: false };

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
