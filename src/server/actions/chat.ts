"use server";

import { revalidatePath } from "next/cache";
import {
  dmThreadKey,
  getDmThreads,
  getNewerMessages,
  getOlderMessages,
  getTeamLastMessage,
  type MessagePage,
} from "@/data/api";
import type { ChatMessage, DmThread } from "@/lib/types";
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

export type SendChatMessageResult =
  | { ok: true; message: { id: string; time: string } }
  | { ok: false };

export async function sendChatMessage(
  threadId: string,
  text: string,
  /** 쿠션 번역기로 다듬은 말이면 true — 말풍선에 표시가 남는다(19 화면의 약속). */
  options: { viaCushion?: boolean } = {},
): Promise<SendChatMessageResult> {
  const me = await requireSessionMember();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false };
  if (trimmed.length > MAX_MESSAGE) return { ok: false };

  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  const created = await db.message.create({
    data: {
      teamId: me.teamId,
      threadKey,
      authorId: me.id,
      text: trimmed,
      viaCushion: options.viaCushion === true,
      whenLabel: nowLabel(),
    },
  });

  // 화면은 낙관적으로 이미 보여 줬으니, 여기서는 그 방 경로만 다시 유효하게 만든다 —
  // `/chat` 레이아웃(팀원 목록·최근 자료)까지 매 메시지마다 다시 부를 필요는 없다.
  revalidatePath(threadId === "team" ? "/chat/team" : `/chat/dm/${threadId}`);
  return { ok: true, message: { id: created.id, time: created.whenLabel } };
}

/** 위로 스크롤해 더 불러오기. `threadId` 가 실제로 내 방인지는 `resolveThread` 가 확인한다. */
export async function loadOlderMessages(threadId: string, cursor: string): Promise<MessagePage> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);
  return getOlderMessages(me.teamId, threadKey, me.id, cursor);
}

/**
 * 열어 둔 방에 **새로 들어온 말**을 가져온다. 화면이 몇 초마다 부른다.
 *
 * 없으면 빈 배열이라 대부분의 호출은 아무것도 돌려주지 않는다 — 그게 정상이다.
 *
 * 새 말이 있으면 읽음 표시도 여기서 함께 밀어 둔다. 방을 열어 두고 보고 있는데
 * 안 읽음이 쌓이면, 그 배지는 "내가 안 본 말"이 아니라 "내가 방을 열어 둔 시간"이 된다.
 * 읽음 표시는 새 말이 실제로 왔을 때만 쓴다 — 조용한 방에서 몇 초마다 쓰기가 나가면
 * 아무 일도 없는 동안 DB 에 쓰기만 쌓인다.
 */
export async function pollNewMessages(
  threadId: string,
  afterId: string | null,
): Promise<ChatMessage[]> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  const fresh = await getNewerMessages(me.teamId, threadKey, me.id, afterId);
  if (fresh.length === 0) return fresh;

  await touchReadMark(me.id, threadKey);
  return fresh;
}

export type SidebarThreads = { teamLast: ChatMessage | null; threads: DmThread[] };

/**
 * 채팅 사이드바(목록)가 몇 초마다 부른다.
 *
 * 방을 열어 둔 화면과 달리 여기는 **어느 방을 보고 있는지 모른다** — 팀 대화
 * 미리보기와 DM 목록 전체(마지막 말·안 읽음 수)를 한 번에 받아 간다. 쿼리는
 * `getTeamLastMessage`(단건) + `getDmThreads`(팀원 수와 무관하게 고정 4개)뿐이라
 * 목록이 길어도 비용이 늘지 않는다.
 */
export async function pollSidebarThreads(): Promise<SidebarThreads> {
  const me = await requireSessionMember();

  const [teamLast, threads] = await Promise.all([
    getTeamLastMessage(me.teamId),
    getDmThreads(me.teamId),
  ]);

  return { teamLast, threads };
}

/** 대화를 열었으면 읽은 것이다 — 목록과 탭 배지의 안 읽음 수가 함께 내려간다. */
export async function markThreadRead(threadId: string): Promise<void> {
  const me = await requireSessionMember();
  const threadKey = await resolveThread(threadId, me.id, me.teamId);

  await touchReadMark(me.id, threadKey);
  revalidatePath("/chat", "layout");
}

async function touchReadMark(memberId: string, threadKey: string): Promise<void> {
  await db.readMark.upsert({
    where: { memberId_threadKey: { memberId, threadKey } },
    update: { readAt: new Date() },
    create: { memberId, threadKey },
  });
}
